import { describe, expect, it } from "vitest";
import { changeType, newQuestion, renameKey } from "./questions";

describe("changeType", () => {
  it("keeps instructions and adds an options list for choice", () => {
    expect(changeType({ type: "noul", instructions: "Is it urgent" }, "choice")).toEqual({
      type: "choice",
      instructions: "Is it urgent",
      options: ["", ""],
    });
  });

  it("carries options over to levels", () => {
    expect(
      changeType({ type: "choice", instructions: "x", options: ["low", "high"] }, "score"),
    ).toEqual({ type: "score", instructions: "x", levels: ["low", "high"] });
  });

  it("drops the list for noul", () => {
    expect(changeType({ type: "score", instructions: "x", levels: ["a", "b"] }, "noul")).toEqual({
      type: "noul",
      instructions: "x",
    });
  });
});

describe("newQuestion", () => {
  it("creates a blank noul question", () => {
    expect(newQuestion()).toEqual({ type: "noul", instructions: "" });
  });
});

describe("renameKey", () => {
  it("renames while preserving order", () => {
    const renamed = renameKey({ a: 1, b: 2, c: 3 }, "b", "z");
    expect(Object.keys(renamed)).toEqual(["a", "z", "c"]);
    expect(renamed.z).toBe(2);
  });
});
