import { Boxes, Database, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { currentNavItem } from "@/components/layout/nav";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isActive, useActiveModel, useDataSummary, useJobs, useMeta } from "@/hooks/queries";
import { cn } from "@/lib/utils";

const PILL = "inline-flex max-w-full items-center gap-1.5 rounded-sm px-2 py-1 font-mono text-code-sm font-semibold [&>svg]:size-3.5 [&>svg]:shrink-0";

function Pill({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cn(PILL, className)}>{children}</span>;
}

/** API reachability, derived from the /meta query every page already makes. */
function ApiStatus() {
  const meta = useMeta();
  if (meta.isPending) return null;
  const ok = meta.isSuccess;
  return (
    <Pill className={ok ? "bg-brand-tint text-primary" : "bg-error-surface text-error-text"}>
      <span className="relative flex size-1.5">
        {ok && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-bright opacity-60" />
        )}
        <span className={cn("relative inline-flex size-1.5 rounded-full", ok ? "bg-brand-bright" : "bg-destructive")} />
      </span>
      {ok ? "API connected" : "API unreachable"}
    </Pill>
  );
}

/** Container: fixed top bar with breadcrumb and live status pills. */
export function AppHeader() {
  const { pathname } = useLocation();
  const page = currentNavItem(pathname);
  const active = useActiveModel();
  const data = useDataSummary("data.jsonl");
  const jobs = useJobs();
  const running = jobs.data?.filter(isActive) ?? [];
  const model = active.data?.active;

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 bg-background/90 px-4 shadow-card backdrop-blur md:px-6">
      <SidebarTrigger className="-ml-1 text-muted-foreground" />
      <nav aria-label="Breadcrumb" className="min-w-0 shrink truncate text-body">
        <span className="text-muted-foreground">Falco Studio</span>
        <span className="mx-1.5 text-text-3">/</span>
        <span className="font-semibold text-foreground">{page?.label ?? "Overview"}</span>
      </nav>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2 overflow-hidden" aria-label="Status">
        {running.length > 0 && (
          <Link to={`/jobs/${running[0].id}`} className={cn(PILL, "bg-secondary-container text-on-secondary-container")}>
            <LoaderCircle className="animate-spin" />
            {running.length} job{running.length > 1 ? "s" : ""}
            <span className="hidden sm:inline">running</span>
          </Link>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              tabIndex={0}
              className={cn(
                PILL,
                "hidden max-w-xs sm:inline-flex",
                model ? "bg-surface-container text-foreground" : "bg-surface-container text-muted-foreground",
              )}
            >
              <Boxes />
              <span className="truncate">
                <span className="text-muted-foreground">Model / </span>
                {model ? model.folder : "none loaded"}
              </span>
            </span>
          </TooltipTrigger>
          <TooltipContent>Model used by the playground and evaluation</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className={cn(PILL, "hidden bg-surface-container text-muted-foreground lg:inline-flex")}>
              <Database />
              {data.data?.exists ? `${data.data.usable}/${data.data.rows} usable rows` : "no data.jsonl"}
            </span>
          </TooltipTrigger>
          <TooltipContent>{data.data?.path ?? "data.jsonl"}</TooltipContent>
        </Tooltip>
        <ApiStatus />
      </div>
    </header>
  );
}
