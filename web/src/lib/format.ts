import type { ParamValue } from "../api/types";

/** A playground/case state: JSON when it parses as an object or array, else trimmed text. */
export function parseStateInput(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

/** Inverse of parseStateInput, for showing a stored state in a textarea. */
export function stateToInput(state: unknown): string {
  if (state === null || state === undefined) return "";
  if (typeof state === "string") return state;
  return JSON.stringify(state, null, 2);
}

export function formatDuration(
  start: string | null,
  end: string | null,
  now: number = Date.now(),
): string {
  if (!start) return "";
  const from = Date.parse(start);
  const to = end ? Date.parse(end) : now;
  if (Number.isNaN(from) || Number.isNaN(to)) return "";
  const seconds = Math.max(0, Math.round((to - from) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function formatDate(value: string | number | null): string {
  if (value === null) return "";
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

/**
 * Form values -> job params: empty values are left out (the backend applies its defaults)
 * and numeric fields are converted when they parse; anything else is sent as typed so the
 * backend's validation message reaches the user.
 */
export function cleanParams(
  values: Record<string, ParamValue>,
  numeric: string[],
): Record<string, ParamValue> {
  const params: Record<string, ParamValue> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (!text) continue;
    if (numeric.includes(key)) {
      const number = Number(text);
      params[key] = Number.isFinite(number) ? number : text;
    } else {
      params[key] = text;
    }
  }
  return params;
}

export function percent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return `${(value * 100).toFixed(digits)}%`;
}

export function fixed(value: number | null | undefined, digits = 4): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return value.toFixed(digits);
}
