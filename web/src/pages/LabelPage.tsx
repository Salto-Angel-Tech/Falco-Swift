import { useQueryClient } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/api/client";
import type { Meta, ParamValue } from "@/api/types";
import { ErrorAlert } from "@/components/common/ErrorAlert";
import { PageHeader } from "@/components/common/PageHeader";
import { ParamForm, type FieldSpec } from "@/components/common/ParamForm";
import { SectionCard } from "@/components/common/SectionCard";
import { DatasetSummaryCard } from "@/components/data/DatasetSummaryCard";
import { JobPanel } from "@/components/jobs/JobPanel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { keys, useRunningJob, useStartJob } from "@/hooks/queries";
import { useJobTarget, useParamValues } from "@/hooks/useJobTarget";
import { cleanParams } from "@/lib/format";

const NUMERIC = ["generate", "threads", "max_retries"];

function fieldsFor(meta: Meta | undefined, provider: string): FieldSpec[] {
  const providers = meta?.providers ?? [];
  const efforts = meta?.efforts ?? [];
  return [
    {
      key: "provider",
      label: "Provider",
      kind: "select",
      options: providers.map((p) => ({ value: p, label: p })),
    },
    {
      key: "model",
      label: "Model",
      kind: "text",
      placeholder: meta?.default_models[provider] ?? "",
      hint: "Teacher model; defaults to the provider's default.",
    },
    {
      key: "effort",
      label: "Effort",
      kind: "select",
      options: [
        { value: "", label: "(provider default)" },
        ...efforts.map((e) => ({ value: e, label: e })),
      ],
    },
    {
      key: "generate",
      label: "Generate",
      kind: "number",
      step: "1",
      hint: "Synthetic states to create (0 = none).",
    },
    { key: "domain", label: "Domain", kind: "text", wide: true, hint: "Describes the states to generate." },
    { key: "states", label: "States file", kind: "text", placeholder: "optional, one state per line" },
    { key: "questions", label: "Questions file", kind: "text" },
    { key: "output", label: "Output", kind: "text", hint: "JSONL file; existing rows are kept." },
    { key: "threads", label: "Threads", kind: "number", step: "1" },
    { key: "max_retries", label: "Max retries", kind: "number", step: "1" },
    { key: "base_url", label: "Base URL", kind: "text", placeholder: "optional" },
    { key: "api_key_env", label: "API key env var", kind: "text", placeholder: "optional" },
  ];
}

export function LabelPage() {
  const client = useQueryClient();
  const seed = useCallback((defaults: Record<string, ParamValue>, meta: Meta) => {
    const provider = String(defaults.provider ?? meta.providers[0] ?? "");
    return { ...defaults, provider, model: defaults.model ?? meta.default_models[provider] ?? "" };
  }, []);
  const { meta, values, ready, set } = useParamValues("tag", seed);
  const { jobId, setStartedId } = useJobTarget("tag");
  const start = useStartJob("tag");
  const running = !!useRunningJob("tag");
  const [summaryPath, setSummaryPath] = useState<string | null>(null);

  const provider = String(values.provider ?? meta.data?.providers[0] ?? "");
  const outputPath = summaryPath ?? String(values.output || "data.jsonl");

  const onChange = (key: string, value: string) => {
    if (key === "provider" && meta.data) {
      const previousDefault = meta.data.default_models[provider];
      if (!values.model || values.model === previousDefault) {
        set("model", meta.data.default_models[value] ?? "");
      }
    }
    set(key, value);
  };

  const onStart = () => {
    const params = cleanParams(
      { ...values, model: values.model || meta.data?.default_models[provider] || null },
      NUMERIC,
    );
    start.mutate(params, {
      onSuccess: (job) => {
        setStartedId(job.id);
        setSummaryPath(String(params.output ?? "data.jsonl"));
        toast.success("Labelling job started", { description: job.id });
      },
      onError: (error) =>
        toast.error("Could not start the labelling job", { description: errorMessage(error) }),
    });
  };

  const onFinished = useCallback(() => {
    client.invalidateQueries({ queryKey: keys.data(outputPath) });
  }, [client, outputPath]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Step 01 · Label"
        title="Label"
        description="A teacher LLM answers your questions for each state and writes a JSONL dataset."
      />
      <SectionCard
        title="Labelling job"
        actions={
          <Button onClick={onStart} disabled={!ready || start.isPending || running}>
            <Play />
            {running ? "A labelling job is running" : start.isPending ? "Starting..." : "Start"}
          </Button>
        }
      >
        <ErrorAlert error={meta.error} />
        {ready ? (
          <ParamForm
            fields={fieldsFor(meta.data, provider)}
            values={values}
            disabled={start.isPending}
            onChange={onChange}
          />
        ) : (
          !meta.error && <Skeleton className="h-48 rounded-xl" />
        )}
        <ErrorAlert error={start.error} />
      </SectionCard>
      {jobId ? (
        <JobPanel key={jobId} jobId={jobId} onFinished={onFinished} />
      ) : (
        <p className="text-body text-text-3">No labelling job yet.</p>
      )}
      <DatasetSummaryCard path={outputPath} />
    </div>
  );
}
