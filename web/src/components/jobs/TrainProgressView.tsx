import type { ReactNode } from "react";
import { CircleCheck, TriangleAlert } from "lucide-react";
import type { Metrics } from "@/api/types";
import { MonoLabel } from "@/components/brand/Eyebrow";
import { LabeledProgress } from "@/components/common/LabeledProgress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fixed, percent } from "@/lib/format";
import type { TrainState } from "@/lib/jobProgress";
import { EpochLossChart, EpochQualityChart, StepLossChart } from "./TrainCharts";

type Render = (value: number | null | undefined) => string;

const METRIC_ROWS: { key: keyof Metrics; label: string; render: Render }[] = [
  { key: "loss", label: "Loss", render: (v) => fixed(v) },
  { key: "accuracy", label: "Accuracy", render: (v) => percent(v) },
  { key: "ece", label: "ECE", render: (v) => fixed(v) },
  { key: "n", label: "Rows", render: (v) => (v === null || v === undefined ? "–" : String(v)) },
];

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-xl bg-surface-low p-4">
      <MonoLabel>{title}</MonoLabel>
      {children}
    </section>
  );
}

function CalibrationPanel({ calibration }: { calibration: NonNullable<TrainState["calibration"]> }) {
  return (
    <Panel title="Calibration">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-stat-lg font-semibold text-primary">
          {fixed(calibration.temperature, 3)}
        </span>
        <span className="text-body text-muted-foreground">temperature</span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Metric</TableHead>
            <TableHead className="text-right">Before</TableHead>
            <TableHead className="text-right">After</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {METRIC_ROWS.map((row) => (
            <TableRow key={row.key}>
              <TableCell className="text-muted-foreground">{row.label}</TableCell>
              <TableCell className="text-right font-mono">
                {row.render(calibration.before?.[row.key])}
              </TableCell>
              <TableCell className="text-right font-mono text-foreground">
                {row.render(calibration.after?.[row.key])}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}

/** Presentational: progress, charts, calibration and results of a train job. */
export function TrainProgressView({
  state,
  epochsPlanned,
}: {
  state: TrainState;
  epochsPlanned?: number;
}) {
  const lastStep = state.steps[state.steps.length - 1];
  return (
    <div className="flex min-w-0 flex-col gap-5">
      {state.device && (
        <p className="text-body text-muted-foreground">
          Device <strong className="text-foreground">{state.device.device}</strong> ·{" "}
          {state.device.train} train rows · {state.device.validation} validation rows
          {state.dropped > 0 && ` · ${state.dropped} unusable rows ignored`}
        </p>
      )}
      {lastStep && state.stepsPerEpoch && (
        <LabeledProgress
          label={`Epoch ${lastStep.epoch}${epochsPlanned ? ` of ${epochsPlanned}` : ""}`}
          value={lastStep.step}
          max={state.stepsPerEpoch}
        />
      )}
      {state.warnings.map((warning, i) => (
        <Alert variant="warning" key={i}>
          <TriangleAlert />
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      ))}
      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <Panel title="Training loss · per step">
          <StepLossChart steps={state.steps} stepsPerEpoch={state.stepsPerEpoch} />
        </Panel>
        <Panel title="Validation · per epoch">
          <Tabs defaultValue="loss" className="min-w-0">
            <TabsList>
              <TabsTrigger value="loss">Loss</TabsTrigger>
              <TabsTrigger value="quality">Accuracy &amp; ECE</TabsTrigger>
            </TabsList>
            <TabsContent value="loss">
              <EpochLossChart epochs={state.epochs} />
            </TabsContent>
            <TabsContent value="quality">
              <EpochQualityChart epochs={state.epochs} />
            </TabsContent>
          </Tabs>
        </Panel>
      </div>
      {state.calibration && <CalibrationPanel calibration={state.calibration} />}
      {state.bestEpoch !== null && (
        <p className="text-body text-muted-foreground">
          Best checkpoint: epoch {state.bestEpoch}, saved in{" "}
          <code className="rounded-sm bg-primary/8 px-1.5 py-0.5 text-primary">{state.savedPath}</code>
        </p>
      )}
      {state.finalPath && (
        <Alert variant="success">
          <CircleCheck />
          <AlertDescription>
            <span>
              Final model in <code>{state.finalPath}</code>
            </span>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
