import { ArrowLeft, RefreshCw } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { ErrorAlert } from "@/components/common/ErrorAlert";
import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { JobPanel } from "@/components/jobs/JobPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isActive, useJobs } from "@/hooks/queries";
import { formatDate, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

export function JobsPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const jobs = useJobs();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="History"
        title="Jobs"
        description="Every labelling and training run, live or replayed from its log."
        actions={
          jobId && (
            <Button variant="outline" onClick={() => navigate("/jobs")}>
              <ArrowLeft />
              Back to history
            </Button>
          )
        }
      />
      {jobId && <JobPanel key={jobId} jobId={jobId} />}
      <SectionCard
        title="History"
        actions={
          <Button variant="outline" size="sm" onClick={() => jobs.refetch()} disabled={jobs.isFetching}>
            <RefreshCw className={jobs.isFetching ? "animate-spin" : undefined} />
            Refresh
          </Button>
        }
      >
        <ErrorAlert error={jobs.error} />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kind</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Id</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.data?.map((job) => (
              <TableRow
                key={job.id}
                tabIndex={0}
                aria-selected={job.id === jobId}
                className={cn("cursor-pointer", job.id === jobId && "bg-primary/8")}
                onClick={() => navigate(`/jobs/${job.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate(`/jobs/${job.id}`);
                  }
                }}
              >
                <TableCell>
                  <Badge variant="muted">{job.kind === "tag" ? "label" : "train"}</Badge>
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <StatusBadge status={job.status} />
                    {job.interrupted && <span className="text-caption text-text-3">interrupted</span>}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDate(job.started_at)}</TableCell>
                <TableCell className="font-mono text-muted-foreground">
                  {formatDuration(job.started_at, isActive(job) ? null : job.ended_at)}
                </TableCell>
                <TableCell className="font-mono text-caption text-text-3">{job.id}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {jobs.data?.length === 0 && <p className="text-body text-text-3">No jobs yet.</p>}
      </SectionCard>
    </div>
  );
}
