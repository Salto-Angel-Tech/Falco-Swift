import { describe, expect, it } from "vitest";
import type { JobEvent } from "../api/types";
import {
  initialTagState,
  initialTrainState,
  reduceTagEvents,
  reduceTrainEvents,
  tagProgress,
} from "./jobProgress";

const ev = (e: Record<string, unknown>, line = 0) => ({ ...e, line }) as JobEvent;

describe("tag reducer", () => {
  it("starts idle", () => {
    expect(tagProgress(initialTagState)).toBeNull();
  });

  it("tracks generation progress", () => {
    const state = reduceTagEvents([
      ev({ type: "generating", total: 200 }),
      ev({ type: "generated", n: 50, total: 200 }),
    ]);
    expect(state.phase).toBe("generating");
    expect(tagProgress(state)).toEqual({ label: "Generating states", value: 50, max: 200 });
  });

  it("switches to labelling progress", () => {
    const state = reduceTagEvents([
      ev({ type: "generating", total: 10 }),
      ev({ type: "generated", n: 10, total: 10 }),
      ev({ type: "labelling", pending: 8, already: 2, output: "data.jsonl" }),
      ev({ type: "progress", done: 3, total: 8 }),
    ]);
    expect(state.phase).toBe("labelling");
    expect(state.already).toBe(2);
    expect(tagProgress(state)).toEqual({ label: "Labelling states", value: 3, max: 8 });
  });

  it("collects failures, warnings and discarded batches", () => {
    const state = reduceTagEvents([
      ev({ type: "discarded", attempt: 1, max: 3, error: "bad json" }, 1),
      ev({ type: "failed", error: "RateLimit: slow down" }, 2),
      ev({ type: "warning", message: 'the teacher skipped "x"' }, 3),
      ev({ type: "gave_up", generated: 4, total: 10 }, 4),
    ]);
    expect(state.issues.map((i) => i.kind)).toEqual(["discarded", "failed", "warning", "gave_up"]);
    expect(state.issues[0].message).toBe("Batch discarded (1/3): bad json");
    expect(state.issues[3].message).toBe("Gave up on generation with 4/10 states");
  });

  it("records the final summary", () => {
    const state = reduceTagEvents([
      ev({ type: "labelling", pending: 2, already: 0, output: "data.jsonl" }),
      ev({ type: "done", ok: 1, failed: 1, output: "data.jsonl" }),
    ]);
    expect(state.phase).toBe("done");
    expect(state.done).toEqual({ ok: 1, failed: 1, output: "data.jsonl" });
    expect(tagProgress(state)).toEqual({ label: "Labelling states", value: 2, max: 2 });
  });

  it("ignores train events", () => {
    const state = reduceTagEvents([ev({ type: "step", epoch: 1, step: 50, total: 100, loss: 1 })]);
    expect(state).toEqual(initialTagState);
  });
});

describe("train reducer", () => {
  it("builds a global step-loss series across epochs", () => {
    const state = reduceTrainEvents([
      ev({ type: "device", device: "cpu", train: 900, validation: 100 }),
      ev({ type: "step", epoch: 1, step: 50, total: 100, loss: 1.2 }),
      ev({ type: "step", epoch: 1, step: 100, total: 100, loss: 1.0 }),
      ev({ type: "step", epoch: 2, step: 50, total: 100, loss: 0.8 }),
    ]);
    expect(state.device).toEqual({ device: "cpu", train: 900, validation: 100 });
    expect(state.steps).toEqual([
      { x: 50, epoch: 1, step: 50, loss: 1.2 },
      { x: 100, epoch: 1, step: 100, loss: 1.0 },
      { x: 150, epoch: 2, step: 50, loss: 0.8 },
    ]);
    expect(state.stepsPerEpoch).toBe(100);
  });

  it("collects validation metrics for multiple epochs", () => {
    const state = reduceTrainEvents([
      ev({ type: "epoch", epoch: 1, loss: 0.9, accuracy: 0.6, ece: 0.1, n: 100 }),
      ev({ type: "saved", path: "model_s1" }),
      ev({ type: "epoch", epoch: 2, loss: 0.7, accuracy: 0.7, ece: 0.08, n: 100 }),
    ]);
    expect(state.epochs).toEqual([
      { epoch: 1, loss: 0.9, accuracy: 0.6, ece: 0.1 },
      { epoch: 2, loss: 0.7, accuracy: 0.7, ece: 0.08 },
    ]);
    expect(state.bestEpoch).toBe(1);
  });

  it("keeps calibration, final path, dropped rows and warnings", () => {
    const before = { loss: 0.7, accuracy: 0.7, ece: 0.08, n: 100 };
    const after = { loss: 0.6, accuracy: 0.7, ece: 0.03, n: 100 };
    const state = reduceTrainEvents([
      ev({ type: "dropped", n: 3 }),
      ev({ type: "warning", message: "temperature fit diverged, keeping 1.0" }),
      ev({ type: "calibration", temperature: 1.42, before, after }),
      ev({ type: "final", path: "/abs/model_s1" }),
    ]);
    expect(state.dropped).toBe(3);
    expect(state.warnings).toEqual(["temperature fit diverged, keeping 1.0"]);
    expect(state.calibration).toEqual({ temperature: 1.42, before, after });
    expect(state.finalPath).toBe("/abs/model_s1");
  });

  it("starts empty", () => {
    expect(reduceTrainEvents([])).toEqual(initialTrainState);
  });
});
