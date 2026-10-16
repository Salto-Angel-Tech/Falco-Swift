import { Check } from "lucide-react";
import type { Decision, Prediction } from "@/api/types";
import { fixed, percent } from "@/lib/format";
import { peakEntry, rankDistribution } from "@/lib/predictions";
import { cn } from "@/lib/utils";

type Of<T extends Prediction["type"]> = Extract<Prediction, { type: T }>;

const PILL = "inline-flex items-center rounded-sm px-2 py-0.5 font-mono text-code-sm font-semibold";

function clampPct(value: number) {
  return Math.min(100, Math.max(0, value * 100));
}

function NoulBody({ name, prediction }: { name: string; prediction: Of<"noul"> }) {
  const p = prediction.noul;
  const verdict = p >= 0.5;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className={cn(PILL, verdict ? "bg-error-surface text-error-text" : "bg-surface-container text-muted-foreground")}>
          {verdict ? "true" : "false"}
        </span>
        <span className="font-mono text-stat-lg font-semibold text-primary">{percent(p)}</span>
      </div>
      <div
        className="flex h-3.5 overflow-hidden rounded-full bg-surface-highest"
        role="img"
        aria-label={`P(${name}=true) ${percent(p)}`}
      >
        <span
          className="block h-full rounded-full bg-primary transition-[width] duration-500 ease-brand"
          style={{ width: `${clampPct(p)}%` }}
        />
      </div>
      <div className="flex justify-between gap-3 font-mono text-code-sm text-muted-foreground">
        <span className="truncate">
          P({name}=true) {percent(p)}
        </span>
        <span>P(false) {percent(1 - p)}</span>
      </div>
    </div>
  );
}

function ChoiceBody({ prediction }: { prediction: Of<"choice"> }) {
  const ranked = rankDistribution(prediction.probability);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-caption text-muted-foreground">
          Argmax:
          <span className={cn(PILL, "bg-brand-tint break-all text-primary")}>{prediction.choice}</span>
        </span>
        <span className="flex items-baseline gap-2">
          <span className="font-mono text-code-sm text-text-3">conf. {percent(prediction.confidence)}</span>
          <span className="font-mono text-stat-lg font-semibold text-primary">
            {percent(prediction.probability[prediction.choice])}
          </span>
        </span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {ranked.map(([option, value]) => {
          const winner = option === prediction.choice;
          return (
            <li
              key={option}
              className="grid grid-cols-[minmax(0,8rem)_1fr_3.5rem] items-center gap-3 text-body"
              title={`${option}: ${percent(value)}`}
            >
              <span
                className={cn(
                  "flex min-w-0 items-center gap-1",
                  winner ? "font-semibold text-primary" : "text-secondary-tone",
                )}
              >
                {winner && <Check aria-hidden="true" className="size-3.5 shrink-0" />}
                <span className="truncate">{option}</span>
              </span>
              <span className="h-2 overflow-hidden rounded-full bg-surface-highest">
                <span
                  className={cn(
                    "block h-full rounded-full transition-[width] duration-500 ease-brand",
                    winner ? "bg-primary" : "bg-secondary-tone/60",
                  )}
                  style={{ width: `${clampPct(value)}%` }}
                />
              </span>
              <span
                className={cn(
                  "text-right font-mono text-code-sm",
                  winner ? "font-semibold text-primary" : "text-muted-foreground",
                )}
              >
                {percent(value)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ScoreBody({ prediction }: { prediction: Of<"score"> }) {
  const entries = Object.entries(prediction.distribution);
  const peak = peakEntry(prediction.distribution);
  const max = peak?.[1] ?? 0;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-baseline gap-2 text-caption text-muted-foreground">
          E(score):
          <span className="font-mono text-stat-lg font-semibold text-warning">{fixed(prediction.score, 2)}</span>
          <span className="font-mono text-code-sm text-text-3">/ 1.00</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="font-mono text-code-sm text-text-3">conf. {percent(prediction.confidence)}</span>
          {peak && (
            <span className={cn(PILL, "bg-warning-surface break-all text-warning-text")}>{peak[0]}</span>
          )}
        </span>
      </div>
      {entries.length > 0 && (
        <div className="rounded-md bg-surface-low p-3">
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${entries.length}, minmax(0, 1fr))` }}
          >
            {entries.map(([level, value]) => {
              const isPeak = level === peak?.[0];
              const height = max > 0 ? Math.max(4, (value / max) * 100) : 4;
              return (
                <div key={level} className="flex min-w-0 flex-col items-center gap-1" title={`${level}: ${percent(value)}`}>
                  <div className="relative flex h-24 w-full items-end justify-center">
                    <span
                      className={cn(
                        "block w-full max-w-10 rounded-t-sm transition-[height] duration-500 ease-brand",
                        isPeak ? "bg-primary" : "bg-secondary-fixed-dim",
                      )}
                      style={{ height: `${height}%` }}
                    />
                    {isPeak && (
                      <span className="absolute -top-1 rounded-sm bg-warning-surface px-1 font-mono text-[10px] leading-4 font-semibold text-warning-text">
                        E={fixed(prediction.score, 2)}
                      </span>
                    )}
                  </div>
                  <span
                    className={cn(
                      "font-mono text-code-sm",
                      isPeak ? "font-semibold text-primary" : "text-muted-foreground",
                    )}
                  >
                    {percent(value, 0)}
                  </span>
                  <span className="w-full truncate text-center text-caption text-muted-foreground">{level}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function PredictionBody({ name, prediction }: { name: string; prediction: Prediction }) {
  if (prediction.type === "noul") return <NoulBody name={name} prediction={prediction} />;
  if (prediction.type === "choice") return <ChoiceBody prediction={prediction} />;
  return <ScoreBody prediction={prediction} />;
}

/** Presentational: one section per question of a /decide result. */
export function PredictionView({ decision }: { decision: Decision }) {
  const entries = Object.entries(decision);
  if (!entries.length) return <p className="text-body text-text-3">No questions were asked.</p>;
  return (
    <div className="flex flex-col">
      {entries.map(([name, prediction], index) => (
        <section
          key={name}
          aria-label={name}
          className="flex min-w-0 flex-col gap-3 border-surface-high py-4 first:pt-0 last:pb-0 [&+&]:border-t"
        >
          <header className="flex min-w-0 items-baseline gap-2">
            <span className="label-caps shrink-0 text-text-3">Target {String(index + 1).padStart(2, "0")}</span>
            <span className="min-w-0 truncate font-mono text-code-base font-semibold text-foreground">{name}</span>
          </header>
          <PredictionBody name={name} prediction={prediction} />
        </section>
      ))}
    </div>
  );
}
