// Types mirroring the Falco Studio backend contract (src/falco/studio: app.py, jobs.py, parse.py).

export type QuestionType = "noul" | "choice" | "score";

export interface NoulQuestion {
  type: "noul";
  instructions: string;
}

export interface ChoiceQuestion {
  type: "choice";
  instructions: string;
  options: string[];
}

export interface ScoreQuestion {
  type: "score";
  instructions: string;
  levels: string[];
}

export type Question = NoulQuestion | ChoiceQuestion | ScoreQuestion;
export type QuestionsMap = Record<string, Question>;

export interface QuestionsFile {
  path: string;
  questions: QuestionsMap;
}

export type ParamValue = string | number | null;
export type TagParams = Record<string, ParamValue>;
export type TrainParams = Record<string, ParamValue>;

export interface Meta {
  providers: string[];
  default_models: Record<string, string>;
  efforts: string[];
  question_types: QuestionType[];
  defaults: {
    tag: TagParams;
    train: TrainParams;
  };
}

export interface DataSummary {
  path: string;
  exists: boolean;
  rows: number;
  usable: number;
  states: number;
  questions: Record<string, number>;
  sample: unknown[];
}

export type JobKind = "tag" | "train";
export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

// ----- parser events -----

export type TagEvent =
  | { type: "generating"; total: number }
  | { type: "generated"; n: number; total: number }
  | { type: "discarded"; attempt: number; max: number; error: string }
  | { type: "gave_up"; generated: number; total: number }
  | { type: "labelling"; pending: number; already: number; output: string }
  | { type: "failed"; error: string }
  | { type: "warning"; message: string }
  | { type: "progress"; done: number; total: number }
  | { type: "done"; ok: number; failed: number; output: string };

export interface Metrics {
  loss: number | null;
  accuracy: number | null;
  ece: number | null;
  n: number;
}

export type TrainEvent =
  | { type: "dropped"; n: number }
  | { type: "device"; device: string; train: number; validation: number }
  | { type: "step"; epoch: number; step: number; total: number; loss: number }
  | {
      type: "epoch";
      epoch: number;
      loss: number | null;
      accuracy: number | null;
      ece: number | null;
      n: number | null;
    }
  | { type: "saved"; path: string }
  | { type: "calibration"; temperature: number; before: Metrics | null; after: Metrics | null }
  | { type: "final"; path: string }
  | { type: "warning"; message: string };

/** A parser event as stored on a job: the event plus the index of the line that produced it. */
export type JobEvent = (TagEvent | TrainEvent) & { line: number };

export interface Job {
  id: string;
  kind: JobKind;
  params: Record<string, ParamValue>;
  argv: string[];
  status: JobStatus;
  returncode: number | null;
  started_at: string | null;
  ended_at: string | null;
  error: string | null;
  interrupted: boolean;
  line_count: number;
  events?: JobEvent[];
  lines?: string[];
}

// ----- models -----

export interface ModelEntry {
  folder: string;
  config: Record<string, unknown> | null;
  complete: boolean;
  mtime: number;
  active: boolean;
}

export interface ActiveModel {
  folder: string;
  device: string;
  max_len: number;
  temperature: number;
}

export type Prediction =
  | { type: "noul"; noul: number }
  | {
      type: "choice";
      choice: string;
      probability: Record<string, number>;
      confidence: number;
    }
  | {
      type: "score";
      score: number;
      distribution: Record<string, number>;
      confidence: number;
    };

export type Decision = Record<string, Prediction>;

// ----- cases / evaluate -----

export interface Case {
  name: string;
  id: string | null;
  state: unknown;
  error?: string;
}

export interface EvaluateEntry {
  file: string;
  id: string | null;
  state: unknown;
  result: Decision | null;
  error: string | null;
}
