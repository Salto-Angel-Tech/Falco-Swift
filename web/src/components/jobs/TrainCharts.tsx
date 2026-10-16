import type { ReactNode } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { EpochPoint, StepPoint } from "@/lib/jobProgress";

const MARGIN = { top: 8, right: 12, bottom: 0, left: 0 };
const CHART_CLASS = "aspect-auto h-[240px] w-full";

const stepConfig = { loss: { label: "Training loss", color: "var(--chart-1)" } } satisfies ChartConfig;
const valLossConfig = {
  loss: { label: "Validation loss", color: "var(--chart-1)" },
} satisfies ChartConfig;
const qualityConfig = {
  accuracy: { label: "Accuracy", color: "var(--chart-1)" },
  ece: { label: "ECE", color: "var(--chart-5)" },
} satisfies ChartConfig;

/** Tooltip row: colored dot, series label, value with 4 decimals. */
function valueRow(config: ChartConfig) {
  return function Row(value: unknown, name: unknown): ReactNode {
    const key = String(name);
    return (
      <div className="flex w-full items-center gap-2">
        <span
          className="size-2.5 shrink-0 rounded-[2px]"
          style={{ background: `var(--color-${key})` }}
        />
        <span className="text-muted-foreground">{config[key]?.label ?? key}</span>
        <span className="ml-auto font-mono text-foreground tabular-nums">
          {typeof value === "number" ? value.toFixed(4) : String(value)}
        </span>
      </div>
    );
  };
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="grid h-[240px] place-items-center rounded-xl bg-surface-low px-6 text-center text-body text-text-3">
      {children}
    </div>
  );
}

/** Training loss (running mean) per logged step; x is the global step across epochs. */
export function StepLossChart({
  steps,
  stepsPerEpoch,
}: {
  steps: StepPoint[];
  stepsPerEpoch: number | null;
}) {
  if (!steps.length) {
    return <Empty>No training steps logged yet (train.py logs every 50 steps).</Empty>;
  }
  return (
    <ChartContainer
      config={stepConfig}
      className={CHART_CLASS}
      role="img"
      aria-label="Training loss per step"
    >
      <LineChart data={steps} margin={MARGIN}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="x"
          type="number"
          domain={["dataMin", "dataMax"]}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis tickLine={false} axisLine={false} width={44} domain={["auto", "auto"]} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={valueRow(stepConfig)}
              labelFormatter={(_, payload) => {
                const point = payload?.[0]?.payload as StepPoint | undefined;
                if (!point) return null;
                return `Epoch ${point.epoch}, step ${point.step}${stepsPerEpoch ? `/${stepsPerEpoch}` : ""}`;
              }}
            />
          }
        />
        <Line
          type="monotone"
          dataKey="loss"
          stroke="var(--color-loss)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  );
}

const epochLabel = (_: unknown, payload: readonly { payload?: unknown }[] | undefined) => {
  const point = payload?.[0]?.payload as EpochPoint | undefined;
  return point ? `Epoch ${point.epoch}` : null;
};

/** Validation loss per epoch (its own scale, so it gets its own chart). */
export function EpochLossChart({ epochs }: { epochs: EpochPoint[] }) {
  if (!epochs.length) return <Empty>Validation runs at the end of each epoch.</Empty>;
  return (
    <ChartContainer
      config={valLossConfig}
      className={CHART_CLASS}
      role="img"
      aria-label="Validation loss per epoch"
    >
      <LineChart data={epochs} margin={MARGIN}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="epoch" allowDecimals={false} tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} width={44} domain={["auto", "auto"]} />
        <ChartTooltip
          content={
            <ChartTooltipContent formatter={valueRow(valLossConfig)} labelFormatter={epochLabel} />
          }
        />
        <Line
          type="monotone"
          dataKey="loss"
          stroke="var(--color-loss)"
          strokeWidth={2}
          dot={{ r: 4, fill: "var(--color-loss)" }}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  );
}

/** Validation accuracy and ECE per epoch; both are ratios in [0, 1] and share one axis. */
export function EpochQualityChart({ epochs }: { epochs: EpochPoint[] }) {
  if (!epochs.length) return <Empty>Accuracy and ECE appear after the first epoch.</Empty>;
  return (
    <ChartContainer
      config={qualityConfig}
      className={CHART_CLASS}
      role="img"
      aria-label="Validation accuracy and ECE per epoch"
    >
      <LineChart data={epochs} margin={MARGIN}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="epoch" allowDecimals={false} tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} width={44} domain={[0, 1]} />
        <ChartTooltip
          content={
            <ChartTooltipContent formatter={valueRow(qualityConfig)} labelFormatter={epochLabel} />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Line
          type="monotone"
          dataKey="accuracy"
          stroke="var(--color-accuracy)"
          strokeWidth={2}
          dot={{ r: 4, fill: "var(--color-accuracy)" }}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="ece"
          stroke="var(--color-ece)"
          strokeWidth={2}
          dot={{ r: 4, fill: "var(--color-ece)" }}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
