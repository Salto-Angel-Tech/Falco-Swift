import { RefreshCw } from "lucide-react";
import { Chip, ChipList } from "@/components/brand/Chip";
import { CodeFigure } from "@/components/brand/CodeFigure";
import { MonoLabel } from "@/components/brand/Eyebrow";
import { ErrorAlert } from "@/components/common/ErrorAlert";
import { SectionCard } from "@/components/common/SectionCard";
import { StatGrid } from "@/components/common/StatGrid";
import { Button } from "@/components/ui/button";
import { useDataSummary } from "@/hooks/queries";

/** Container: summary of a labelled dataset (GET /api/data). */
export function DatasetSummaryCard({ path }: { path: string }) {
  const summary = useDataSummary(path);
  const data = summary.data;
  const questions = Object.entries(data?.questions ?? {});
  return (
    <SectionCard
      title={
        <span className="flex flex-wrap items-baseline gap-2">
          Dataset <code className="text-body font-normal text-primary">{path}</code>
        </span>
      }
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => summary.refetch()}
          disabled={summary.isFetching}
        >
          <RefreshCw className={summary.isFetching ? "animate-spin" : undefined} />
          Refresh
        </Button>
      }
    >
      <ErrorAlert error={summary.error} />
      {data && !data.exists && <p className="text-body text-text-3">The file does not exist yet.</p>}
      {data && data.exists && (
        <>
          <StatGrid
            stats={[
              { label: "rows", value: data.rows },
              { label: "usable rows", value: data.usable },
              { label: "distinct states", value: data.states },
              { label: "questions", value: questions.length },
            ]}
          />
          {questions.length > 0 && (
            <div className="flex flex-col gap-3">
              <MonoLabel>Usable rows per question</MonoLabel>
              <ChipList>
                {questions.map(([name, count]) => (
                  <Chip key={name}>
                    {name}
                    <span className="font-mono text-caption text-primary">{count}</span>
                  </Chip>
                ))}
              </ChipList>
            </div>
          )}
          {data.sample.length > 0 && (
            <CodeFigure
              caption="Sample"
              meta={`${data.sample.length} rows`}
              preClassName="max-h-[260px]"
            >
              {data.sample.map((row) => JSON.stringify(row)).join("\n")}
            </CodeFigure>
          )}
        </>
      )}
    </SectionCard>
  );
}
