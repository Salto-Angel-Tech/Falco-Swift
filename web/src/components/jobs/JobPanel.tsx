import { useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Square } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/api/client";
import type { JobStatus } from "@/api/types";
import { CodeFigure } from "@/components/brand/CodeFigure";
import { ErrorAlert } from "@/components/common/ErrorAlert";
import { LogFigure } from "@/components/common/LogFigure";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { isActive, keys, useCancelJob, useJob } from "@/hooks/queries";
import { useJobStream } from "@/hooks/useJobStream";
import { formatDate, formatDuration } from "@/lib/format";
import { reduceTagEvents, reduceTrainEvents } from "@/lib/jobProgress";
import { TagProgressView } from "./TagProgressView";
import { TrainProgressView } from "./TrainProgressView";

interface JobPanelProps {
  jobId: string;
  /** Called once when the stream reports the job's final status. */
  onFinished?: (status: JobStatus) => void;
}

/**
 * Container: follows one job over SSE (live or replayed from the backlog for finished jobs)
 * and renders the matching progress view, the command, the log and a cancel button.
 */
export function JobPanel({ jobId, onFinished }: JobPanelProps) {
  const client = useQueryClient();
  const job = useJob(jobId);
  const stream = useJobStream(jobId);
  const cancel = useCancelJob();
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  useEffect(() => {
    if (!stream.status) return;
    client.invalidateQueries({ queryKey: keys.jobs });
    onFinishedRef.current?.(stream.status);
  }, [stream.status, client]);

  const kind = job.data?.kind ?? (jobId.startsWith("train") ? "train" : "tag");
  const tagState = useMemo(
    () => (kind === "tag" ? reduceTagEvents(stream.events) : null),
    [kind, stream.events],
  );
  const trainState = useMemo(
    () => (kind === "train" ? reduceTrainEvents(stream.events) : null),
    [kind, stream.events],
  );

  const status: JobStatus = stream.status ?? job.data?.status ?? "queued";
  const running = isActive({ status });
  const epochs = Number(job.data?.params?.epochs) || undefined;

  const onCancel = () =>
    cancel.mutate(jobId, {
      onSuccess: () => toast.success("Cancellation requested"),
      onError: (error) => toast.error("Could not cancel the job", { description: errorMessage(error) }),
    });

  return (
    <SectionCard
      title={
        <span className="flex flex-wrap items-center gap-3">
          <span>{kind === "tag" ? "Labelling job" : "Training job"}</span>
          <StatusBadge status={status} />
        </span>
      }
      actions={
        running && (
          <Button variant="destructive" size="sm" onClick={onCancel} disabled={cancel.isPending}>
            <Square />
            {cancel.isPending ? "Cancelling..." : "Cancel"}
          </Button>
        )
      }
    >
      <p className="flex flex-wrap gap-x-2 font-mono text-caption break-all text-text-3">
        <span>{jobId}</span>
        {job.data?.started_at && <span>· started {formatDate(job.data.started_at)}</span>}
        {job.data?.started_at && (
          <span>· {formatDuration(job.data.started_at, running ? null : job.data.ended_at)}</span>
        )}
        {stream.returncode !== null && <span>· exit code {stream.returncode}</span>}
      </p>
      <ErrorAlert error={job.error} />
      {job.data?.error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription className="break-words">{job.data.error}</AlertDescription>
        </Alert>
      )}
      {status === "failed" && !job.data?.error && stream.status && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>The job failed. Check the log for details.</AlertDescription>
        </Alert>
      )}
      {tagState && <TagProgressView state={tagState} />}
      {trainState && <TrainProgressView state={trainState} epochsPlanned={epochs} />}
      {job.data?.argv && (
        <CodeFigure caption="Command" preClassName="whitespace-pre-wrap break-all">
          {job.data.argv.join(" ")}
        </CodeFigure>
      )}
      <LogFigure lines={stream.lines} />
    </SectionCard>
  );
}
