import { PageHeader } from "@/components/common/PageHeader";
import { TrainRunningWarning } from "@/components/jobs/TrainRunningWarning";
import { ModelsTable } from "@/components/models/ModelsTable";
import { Playground } from "@/components/models/Playground";
import { useActiveModel } from "@/hooks/queries";
import { fixed } from "@/lib/format";

/** Status pill: the loaded model and its calibration temperature. */
function ActiveModelPill() {
  const model = useActiveModel().data?.active;
  if (!model) return null;
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-sm bg-surface-container px-2 py-1 font-mono text-code-sm font-semibold">
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-brand-bright" />
      <span className="min-w-0 truncate">
        <span className="text-muted-foreground">Model / </span>
        <span className="text-foreground">{model.folder}</span>
      </span>
      <span className="shrink-0 rounded-sm bg-card px-1.5 text-muted-foreground shadow-sm">
        T={fixed(model.temperature, 2)}
      </span>
    </span>
  );
}

export function ModelsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Step 03 · Serve"
        title="Models & Playground"
        description="Load a trained model and try it on real messages before serving it."
        actions={<ActiveModelPill />}
      />
      <TrainRunningWarning />
      <ModelsTable />
      <Playground />
    </div>
  );
}
