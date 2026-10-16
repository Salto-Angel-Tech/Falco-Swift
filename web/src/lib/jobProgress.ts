import type { JobEvent, Metrics } from "../api/types";

// ---------- tag ----------

export type TagPhase = "idle" | "generating" | "labelling" | "done";
export type TagIssueKind = "discarded" | "failed" | "warning" | "gave_up";

export interface TagIssue {
  kind: TagIssueKind;
  message: string;
  line: number;
}

export interface TagState {
  phase: TagPhase;
  generated: { n: number; total: number } | null;
  labelling: { done: number; total: number } | null;
  already: number;
  output: string | null;
  issues: TagIssue[];
  done: { ok: number; failed: number; output: string } | null;
}

export const initialTagState: TagState = {
  phase: "idle",
  generated: null,
  labelling: null,
  already: 0,
  output: null,
  issues: [],
  done: null,
};

export function reduceTag(state: TagState, event: JobEvent): TagState {
  switch (event.type) {
    case "generating":
      return { ...state, phase: "generating", generated: { n: 0, total: event.total } };
    case "generated":
      return { ...state, phase: "generating", generated: { n: event.n, total: event.total } };
    case "labelling":
      return {
        ...state,
        phase: "labelling",
        labelling: { done: 0, total: event.pending },
        already: event.already,
        output: event.output,
      };
    case "progress":
      return { ...state, phase: "labelling", labelling: { done: event.done, total: event.total } };
    case "discarded":
      return addIssue(
        state,
        "discarded",
        `Batch discarded (${event.attempt}/${event.max}): ${event.error}`,
        event.line,
      );
    case "gave_up":
      return addIssue(
        state,
        "gave_up",
        `Gave up on generation with ${event.generated}/${event.total} states`,
        event.line,
      );
    case "failed":
      return addIssue(state, "failed", event.error, event.line);
    case "warning":
      return addIssue(state, "warning", event.message, event.line);
    case "done": {
      const total = state.labelling?.total ?? event.ok + event.failed;
      return {
        ...state,
        phase: "done",
        labelling: { done: total, total },
        output: event.output,
        done: { ok: event.ok, failed: event.failed, output: event.output },
      };
    }
    default:
      return state;
  }
}

function addIssue(state: TagState, kind: TagIssueKind, message: string, line: number): TagState {
  return { ...state, issues: [...state.issues, { kind, message, line }] };
}

export function reduceTagEvents(events: JobEvent[]): TagState {
  return events.reduce(reduceTag, initialTagState);
}

export interface ProgressValue {
  label: string;
  value: number;
  max: number;
}

/** The progress bar to show: generation n/total, then labelling done/total. */
export function tagProgress(state: TagState): ProgressValue | null {
  if (state.labelling) {
    return { label: "Labelling states", value: state.labelling.done, max: state.labelling.total };
  }
  if (state.generated) {
    return { label: "Generating states", value: state.generated.n, max: state.generated.total };
  }
  return null;
}

// ---------- train ----------

export interface StepPoint {
  /** Global step across epochs, used as the x axis. */
  x: number;
  epoch: number;
  step: number;
  loss: number;
}

export interface EpochPoint {
  epoch: number;
  loss: number | null;
  accuracy: number | null;
  ece: number | null;
}

export interface TrainState {
  device: { device: string; train: number; validation: number } | null;
  dropped: number;
  stepsPerEpoch: number | null;
  steps: StepPoint[];
  epochs: EpochPoint[];
  bestEpoch: number | null;
  savedPath: string | null;
  calibration: { temperature: number; before: Metrics | null; after: Metrics | null } | null;
  finalPath: string | null;
  warnings: string[];
}

export const initialTrainState: TrainState = {
  device: null,
  dropped: 0,
  stepsPerEpoch: null,
  steps: [],
  epochs: [],
  bestEpoch: null,
  savedPath: null,
  calibration: null,
  finalPath: null,
  warnings: [],
};

export function reduceTrain(state: TrainState, event: JobEvent): TrainState {
  switch (event.type) {
    case "device":
      return {
        ...state,
        device: { device: event.device, train: event.train, validation: event.validation },
      };
    case "dropped":
      return { ...state, dropped: event.n };
    case "step": {
      const point = {
        x: (event.epoch - 1) * event.total + event.step,
        epoch: event.epoch,
        step: event.step,
        loss: event.loss,
      };
      return { ...state, stepsPerEpoch: event.total, steps: [...state.steps, point] };
    }
    case "epoch": {
      const point = {
        epoch: event.epoch,
        loss: event.loss,
        accuracy: event.accuracy,
        ece: event.ece,
      };
      return { ...state, epochs: [...state.epochs.filter((e) => e.epoch !== event.epoch), point] };
    }
    case "saved": {
      const last = state.epochs[state.epochs.length - 1];
      return { ...state, savedPath: event.path, bestEpoch: last ? last.epoch : state.bestEpoch };
    }
    case "calibration":
      return {
        ...state,
        calibration: { temperature: event.temperature, before: event.before, after: event.after },
      };
    case "final":
      return { ...state, finalPath: event.path };
    case "warning":
      return { ...state, warnings: [...state.warnings, event.message] };
    default:
      return state;
  }
}

export function reduceTrainEvents(events: JobEvent[]): TrainState {
  return events.reduce(reduceTrain, initialTrainState);
}
