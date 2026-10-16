import { Progress } from "@/components/ui/progress";

/** shadcn Progress with a label and a "value/max (pct)" readout. */
export function LabeledProgress({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3 text-body">
        <span className="text-foreground">{label}</span>
        <span className="font-mono text-caption text-text-3">
          {value}/{max} ({Math.round(ratio * 100)}%)
        </span>
      </div>
      <Progress value={ratio * 100} aria-label={label} className="h-2" />
    </div>
  );
}
