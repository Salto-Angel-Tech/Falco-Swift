import { describe, expect, it } from "vitest";
import { cleanParams, formatDuration, parseStateInput, percent } from "./format";

describe("parseStateInput", () => {
  it("keeps plain text as a string", () => {
    expect(parseStateInput("  I want my money back  ")).toBe("I want my money back");
  });

  it("parses a JSON object", () => {
    expect(parseStateInput('{"subject": "refund"}')).toEqual({ subject: "refund" });
  });

  it("parses a JSON array", () => {
    expect(parseStateInput("[1, 2]")).toEqual([1, 2]);
  });

  it("falls back to text when JSON is invalid", () => {
    expect(parseStateInput("{not json")).toBe("{not json");
  });
});

describe("formatDuration", () => {
  it("is empty without a start", () => {
    expect(formatDuration(null, null)).toBe("");
  });

  it("formats seconds, minutes and hours", () => {
    expect(formatDuration("2026-01-01T00:00:00+00:00", "2026-01-01T00:00:42+00:00")).toBe("42s");
    expect(formatDuration("2026-01-01T00:00:00+00:00", "2026-01-01T00:03:05+00:00")).toBe("3m 5s");
    expect(formatDuration("2026-01-01T00:00:00+00:00", "2026-01-01T02:01:00+00:00")).toBe("2h 1m");
  });

  it("uses now for running jobs", () => {
    const now = Date.parse("2026-01-01T00:00:10+00:00");
    expect(formatDuration("2026-01-01T00:00:00+00:00", null, now)).toBe("10s");
  });
});

describe("cleanParams", () => {
  it("drops empty values and converts numeric fields", () => {
    expect(
      cleanParams(
        { provider: "anthropic", model: "", threads: "4", lr: "2e-5", states: null },
        ["threads", "lr"],
      ),
    ).toEqual({ provider: "anthropic", threads: 4, lr: 0.00002 });
  });

  it("keeps non-numeric text in numeric fields so the server can reject it", () => {
    expect(cleanParams({ threads: "four" }, ["threads"])).toEqual({ threads: "four" });
  });
});

describe("percent", () => {
  it("formats a ratio", () => {
    expect(percent(0.4567)).toBe("45.7%");
    expect(percent(null)).toBe("–");
  });
});
