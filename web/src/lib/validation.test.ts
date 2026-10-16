import { describe, expect, it } from "vitest";
import { validateName, validateQuestion, validateQuestions } from "./validation";

describe("validateQuestion", () => {
  it("accepts a valid noul question", () => {
    expect(validateQuestion({ type: "noul", instructions: "Is it urgent" })).toEqual([]);
  });

  it("requires instructions", () => {
    expect(validateQuestion({ type: "noul", instructions: "  " })).toContain(
      "Instructions are required.",
    );
  });

  it("rejects an unknown type", () => {
    const question = { type: "bogus", instructions: "x" } as never;
    expect(validateQuestion(question)).toContain('"bogus" is not a valid type.');
  });

  it("requires at least two options for choice", () => {
    expect(validateQuestion({ type: "choice", instructions: "x", options: ["a"] })).toContain(
      "A choice question needs at least 2 options.",
    );
  });

  it("requires at least two levels for score", () => {
    expect(validateQuestion({ type: "score", instructions: "x", levels: [] })).toContain(
      "A score question needs at least 2 levels.",
    );
  });

  it("flags blank and duplicate options", () => {
    const errors = validateQuestion({ type: "choice", instructions: "x", options: ["a", "", "a"] });
    expect(errors).toContain("Options cannot be blank.");
    expect(errors).toContain("Options must be unique.");
  });
});

describe("validateName", () => {
  it("requires a non-empty name", () => {
    expect(validateName("", [])).toBe("A name is required.");
  });

  it("rejects duplicates", () => {
    expect(validateName("urgent", ["urgent"])).toBe('"urgent" already exists.');
  });

  it("accepts a fresh name", () => {
    expect(validateName("urgent", ["other"])).toBeNull();
  });
});

describe("validateQuestions", () => {
  it("returns only invalid questions keyed by name", () => {
    const errors = validateQuestions({
      ok: { type: "noul", instructions: "fine" },
      bad: { type: "score", instructions: "x", levels: ["one"] },
    });
    expect(Object.keys(errors)).toEqual(["bad"]);
    expect(errors.bad).toEqual(["A score question needs at least 2 levels."]);
  });
});
