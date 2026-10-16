import type {
  ActiveModel,
  Case,
  DataSummary,
  Decision,
  EvaluateEntry,
  Job,
  JobKind,
  Meta,
  ModelEntry,
  ParamValue,
  QuestionsFile,
  QuestionsMap,
} from "./types";

const BASE = "/api";

/** An HTTP error from the studio API, carrying FastAPI's `detail`. */
export class ApiError extends Error {
  readonly status: number;
  readonly detail: unknown;
  /** Per-name errors when `detail` is a {name: reason} object (questions validation). */
  readonly fieldErrors: Record<string, string> | null;

  constructor(status: number, detail: unknown) {
    super(detailMessage(detail));
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.fieldErrors = isStringRecord(detail) ? detail : null;
  }
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((v) => typeof v === "string")
  );
}

interface ValidationItem {
  loc?: unknown[];
  msg?: string;
}

/** Turn any FastAPI `detail` shape into one human readable line. */
export function detailMessage(detail: unknown): string {
  if (typeof detail === "string" && detail) return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item: ValidationItem) => {
        const where = Array.isArray(item?.loc) ? item.loc.join(".") : "";
        const msg = item?.msg ?? JSON.stringify(item);
        return where ? `${where}: ${msg}` : msg;
      })
      .join("; ");
  }
  if (isStringRecord(detail) && Object.keys(detail).length > 0) {
    return Object.entries(detail)
      .map(([name, reason]) => `${name}: ${reason}`)
      .join("; ");
  }
  return "request failed";
}

/** Message for any thrown value, for display in the UI. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function withQuery(path: string, query?: Record<string, string>): string {
  if (!query) return `${BASE}${path}`;
  return `${BASE}${path}?${new URLSearchParams(query).toString()}`;
}

async function request<T>(
  method: string,
  path: string,
  options: { query?: Record<string, string>; body?: unknown } = {},
): Promise<T> {
  const init: RequestInit = { method, headers: { Accept: "application/json" } };
  if (options.body !== undefined) {
    init.headers = { ...init.headers, "Content-Type": "application/json" };
    init.body = JSON.stringify(options.body);
  }
  const response = await fetch(withQuery(path, options.query), init);
  const text = await response.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    const detail =
      typeof data === "object" && data !== null && "detail" in data
        ? (data as { detail: unknown }).detail
        : data || response.statusText;
    throw new ApiError(response.status, detail);
  }
  return data as T;
}

export const api = {
  meta: () => request<Meta>("GET", "/meta"),

  questions: (path: string) => request<QuestionsFile>("GET", "/questions", { query: { path } }),
  saveQuestions: (path: string, questions: QuestionsMap) =>
    request<QuestionsFile>("PUT", "/questions", { query: { path }, body: { questions } }),

  data: (path: string) => request<DataSummary>("GET", "/data", { query: { path } }),

  jobs: () => request<Job[]>("GET", "/jobs"),
  job: (id: string, lines = false) =>
    request<Job>("GET", `/jobs/${encodeURIComponent(id)}`, {
      query: lines ? { lines: "true" } : undefined,
    }),
  startJob: (kind: JobKind, params: Record<string, ParamValue>) =>
    request<Job>("POST", "/jobs", { body: { kind, params } }),
  cancelJob: (id: string) => request<Job>("POST", `/jobs/${encodeURIComponent(id)}/cancel`),

  models: () => request<ModelEntry[]>("GET", "/models"),
  activeModel: () => request<{ active: ActiveModel | null }>("GET", "/models/active"),
  loadModel: (folder: string) => request<ActiveModel>("POST", "/models/load", { body: { folder } }),

  decide: (state: unknown, questions: QuestionsMap) =>
    request<Decision>("POST", "/decide", { body: { state, questions } }),

  cases: (dir: string) => request<Case[]>("GET", "/cases", { query: { dir } }),
  putCase: (dir: string, name: string, body: { id?: string | null; state: unknown }) =>
    request<Case>("PUT", `/cases/${encodeURIComponent(name)}`, { query: { dir }, body }),
  deleteCase: (dir: string, name: string) =>
    request<{ deleted: string }>("DELETE", `/cases/${encodeURIComponent(name)}`, {
      query: { dir },
    }),
  evaluate: (dir: string, questionsPath: string) =>
    request<EvaluateEntry[]>("POST", "/evaluate", {
      body: { dir, questions_path: questionsPath },
    }),
};

export function jobEventsUrl(id: string, offset: number): string {
  return `${BASE}/jobs/${encodeURIComponent(id)}/events?offset=${offset}`;
}
