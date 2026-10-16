import { Ban, CircleCheck, CircleX, Clock, LoaderCircle, type LucideIcon } from "lucide-react";
import type { JobStatus } from "@/api/types";
import { Badge } from "@/components/ui/badge";

const VARIANTS = {
  queued: "info",
  running: "info",
  succeeded: "success",
  failed: "danger",
  cancelled: "warning",
} as const satisfies Record<JobStatus, string>;

const ICONS: Record<JobStatus, LucideIcon> = {
  queued: Clock,
  running: LoaderCircle,
  succeeded: CircleCheck,
  failed: CircleX,
  cancelled: Ban,
};

export function StatusBadge({ status }: { status: JobStatus }) {
  const Icon = ICONS[status];
  return (
    <Badge variant={VARIANTS[status]}>
      <Icon aria-hidden="true" className={status === "running" ? "animate-spin" : undefined} />
      {status}
    </Badge>
  );
}
