import { percent } from "@/lib/format";
import { cn } from "@/lib/utils";

/** One labelled horizontal bar for a probability in [0, 1]. */
export function BarRow({
  label,
  value,
  selected = false,
}: {
  label: string;
  value: number;
  selected?: boolean;
}) {
  const width = Math.min(100, Math.max(0, value * 100));
  return (
    <div
      className="grid grid-cols-[minmax(0,7.5rem)_1fr_3.5rem] items-center gap-3 text-body"
      title={`${label}: ${percent(value)}`}
    >
      <span className={cn("truncate", selected ? "font-semibold text-foreground" : "text-muted-foreground")}>
        {label}
      </span>
      <span className="h-2 overflow-hidden rounded-full bg-surface-highest">
        <span
          className={cn(
            "block h-full rounded-full transition-[width] duration-500 ease-brand",
            selected ? "bg-primary" : "bg-secondary-tone/60",
          )}
          style={{ width: `${width}%` }}
        />
      </span>
      <span className="text-right font-mono text-code-sm text-muted-foreground">{percent(value)}</span>
    </div>
  );
}

export function DistributionBars({
  distribution,
  selected,
}: {
  distribution: Record<string, number>;
  selected?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {Object.entries(distribution).map(([label, value]) => (
        <BarRow key={label} label={label} value={value} selected={label === selected} />
      ))}
    </div>
  );
}
