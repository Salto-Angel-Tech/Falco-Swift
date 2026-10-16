import { describe, expect, it } from "vitest";
import { parseQuestionsMap, peakEntry, rankDistribution } from "./predictions";

describe("rankDistribution", () => {
  it("sorts options by probability, highest first", () => {
    expect(rankDistribution({ a: 0.2, b: 0.7, c: 0.1 })).toEqual([
      ["b", 0.7],
      ["a", 0.2],
      ["c", 0.1],
    ]);
  });
});

describe("peakEntry", () => {
  it("returns the most likely level", () => {
    expect(peakEntry({ low: 0.1, mid: 0.6, high: 0.3 })).toEqual(["mid", 0.6]);
  });

  it("returns undefined for an empty distribution", () => {
    expect(peakEntry({})).toBeUndefined();
  });
});

describe("parseQuestionsMap", () => {
  it("parses a questions object", () => {
    expect(parseQuestionsMap('{"urgent": {"type": "noul", "instructions": "x"}}')).toEqual({
      urgent: { type: "noul", instructions: "x" },
    });
  });

  it("returns null for invalid JSON, arrays and primitives", () => {
    expect(parseQuestionsMap("{")).toBeNull();
    expect(parseQuestionsMap("[]")).toBeNull();
    expect(parseQuestionsMap("3")).toBeNull();
  });
});
