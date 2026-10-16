import { useMemo, type ReactNode } from "react";
import { MonoLabel } from "@/components/brand/Eyebrow";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveModel, useDataSummary, useJob, useJobs, useRunningJob } from "@/hooks/queries";
import { fixed, formatDate, percent } from "@/lib/format";
import { reduceTrainEvents } from "@/lib/jobProgress";

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-mono text-stat-lg font-semibold text-foreground">
        {value}
      </div>
      <MonoLabel className="mt-0.5">{label}</MonoLabel>
    </div>
  );
}

function StatusHeader({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-center gap-2">{children}</div>;
}

/** Container: live dataset status for the Label step. */
export function LabelStatus({ path = "data.jsonl" }: { path?: string }) {
  const data = useDataSummary(path);
  const running = useRunningJob("tag");
  if (data.isLoading) return <Skeleton className="h-16" />;
  return (
    <>
      <StatusHeader>
        {running ? (
          <StatusBadge status={running.status} />
        ) : (
          <Badge variant={data.data?.exists ? "success" : "muted"}>
            {data.data?.exists ? "dataset ready" : "no dataset yet"}
          </Badge>
        )}
        <span className="font-mono text-caption text-text-3">{path}</span>
      </StatusHeader>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="rows" value={data.data?.rows ?? 0} />
        <Stat label="usable" value={data.data?.usable ?? 0} />
        <Stat label="questions" value={Object.keys(data.data?.questions ?? {}).length} />
      </div>
    </>
  );
}

/** Container: the newest training job and its last validation metrics. */
export function TrainStatus() {
  const jobs = useJobs();
  const last = jobs.data?.find((job) => job.kind === "train");
  const detail = useJob(last?.id ?? null);
  const state = useMemo(() => reduceTrainEvents(detail.data?.events ?? []), [detail.data?.events]);
  const epoch = state.epochs[state.epochs.length - 1];

  if (jobs.isLoading) return <Skeleton className="h-16" />;
  if (!last) {
    return (
      <StatusHeader>
        <Badge variant="muted">no training run yet</Badge>
      </StatusHeader>
    );
  }
  return (
    <>
      <StatusHeader>
        <StatusBadge status={last.status} />
        <span className="font-mono text-caption text-text-3">{formatDate(last.started_at)}</span>
      </StatusHeader>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="accuracy" value={percent(epoch?.accuracy)} />
        <Stat label="ece" value={fixed(epoch?.ece, 3)} />
        <Stat
          label="temperature"
          value={state.calibration ? fixed(state.calibration.temperature, 2) : "–"}
        />
      </div>
    </>
  );
}

/** Container: the model loaded for the playground and evaluation. */
export function ServeStatus() {
  const active = useActiveModel();
  const model = active.data?.active;
  if (active.isLoading) return <Skeleton className="h-16" />;
  if (!model) {
    return (
      <StatusHeader>
        <Badge variant="muted">no model loaded</Badge>
      </StatusHeader>
    );
  }
  return (
    <>
      <StatusHeader>
        <Badge variant="success">loaded</Badge>
        <span className="min-w-0 truncate font-mono text-caption text-text-3">{model.folder}</span>
      </StatusHeader>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="device" value={model.device} />
        <Stat label="max len" value={model.max_len} />
        <Stat label="temp." value={fixed(model.temperature, 2)} />
      </div>
    </>
  );
}
