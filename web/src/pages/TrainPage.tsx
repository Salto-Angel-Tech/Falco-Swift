import { useQueryClient } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { useCallback } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/api/client";
import { ErrorAlert } from "@/components/common/ErrorAlert";
import { PageHeader } from "@/components/common/PageHeader";
import { ParamForm, type FieldSpec } from "@/components/common/ParamForm";
import { SectionCard } from "@/components/common/SectionCard";
import { JobPanel } from "@/components/jobs/JobPanel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { keys, useRunningJob, useStartJob } from "@/hooks/queries";
import { useJobTarget, useParamValues } from "@/hooks/useJobTarget";
import { cleanParams } from "@/lib/format";

const NUMERIC = ["epochs", "lr", "batch", "max_len", "val", "seed"];

const FIELDS: FieldSpec[] = [
  { key: "data", label: "Data", kind: "text", hint: "Labelled JSONL file." },
  { key: "base", label: "Base model", kind: "text", hint: "Hugging Face encoder." },
  { key: "output", label: "Output folder", kind: "text" },
  { key: "epochs", label: "Epochs", kind: "number", step: "1" },
  { key: "lr", label: "Learning rate", kind: "number" },
  { key: "batch", label: "Batch size", kind: "number", step: "1" },
  { key: "max_len", label: "Max length", kind: "number", step: "1", hint: "Tokens per pair." },
  { key: "val", label: "Validation share", kind: "number", step: "0.01" },
  { key: "seed", label: "Seed", kind: "number", step: "1" },
];

export function TrainPage() {
  const client = useQueryClient();
  const { meta, values, ready, set } = useParamValues("train");
  const { jobId, setStartedId } = useJobTarget("train");
  const start = useStartJob("train");
  const running = !!useRunningJob("train");

  const onStart = () => {
    start.mutate(cleanParams(values, NUMERIC), {
      onSuccess: (job) => {
        setStartedId(job.id);
        toast.success("Training job started", { description: job.id });
      },
      onError: (error) =>
        toast.error("Could not start the training job", { description: errorMessage(error) }),
    });
  };

  const onFinished = useCallback(() => {
    client.invalidateQueries({ queryKey: keys.models });
  }, [client]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Step 02 · Train"
        title="Train"
        description="Fine-tune a multilingual encoder on the labelled data, then calibrate it with temperature scaling."
      />
      <SectionCard
        title="Training job"
        actions={
          <Button onClick={onStart} disabled={!ready || start.isPending || running}>
            <Play />
            {running ? "A training job is running" : start.isPending ? "Starting..." : "Start"}
          </Button>
        }
      >
        <ErrorAlert error={meta.error} />
        {ready ? (
          <ParamForm
            fields={FIELDS}
            values={values}
            disabled={start.isPending}
            onChange={(key, value) => set(key, value)}
          />
        ) : (
          !meta.error && <Skeleton className="h-40 rounded-xl" />
        )}
        <ErrorAlert error={start.error} />
      </SectionCard>
      {jobId ? (
        <JobPanel key={jobId} jobId={jobId} onFinished={onFinished} />
      ) : (
        <p className="text-body text-text-3">No training job yet.</p>
      )}
    </div>
  );
}
