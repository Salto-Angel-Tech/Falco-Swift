import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, detailMessage } from "./client";

function respond(status: number, body: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("detailMessage", () => {
  it("returns a string detail unchanged", () => {
    expect(detailMessage("no model loaded")).toBe("no model loaded");
  });

  it("joins a per-name error object", () => {
    expect(detailMessage({ a: "a is not a valid question", b: "bad" })).toBe(
      "a: a is not a valid question; b: bad",
    );
  });

  it("formats FastAPI validation error lists", () => {
    const detail = [{ loc: ["body", "state"], msg: "Field required", type: "missing" }];
    expect(detailMessage(detail)).toBe("body.state: Field required");
  });

  it("falls back for unknown shapes", () => {
    expect(detailMessage(null)).toBe("request failed");
  });
});

describe("api client", () => {
  afterEach(() => vi.restoreAllMocks());

  it("parses JSON on success", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(respond(200, { active: null }));
    await expect(api.activeModel()).resolves.toEqual({ active: null });
    expect(fetchMock).toHaveBeenCalledWith("/api/models/active", expect.any(Object));
  });

  it("maps a string detail to an ApiError with status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      respond(409, { detail: "a train job is already running" }),
    );
    const error = await api.startJob("train", {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(409);
    expect((error as ApiError).message).toBe("a train job is already running");
    expect((error as ApiError).fieldErrors).toBeNull();
  });

  it("exposes per-question field errors from a 400 object detail", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      respond(400, { detail: { urgent: "urgent is not a valid question" } }),
    );
    const error = (await api
      .saveQuestions("questions.json", {})
      .catch((e: unknown) => e)) as ApiError;
    expect(error.status).toBe(400);
    expect(error.fieldErrors).toEqual({ urgent: "urgent is not a valid question" });
  });

  it("handles a non-JSON error body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Internal Server Error", { status: 500 }),
    );
    const error = (await api.meta().catch((e: unknown) => e)) as ApiError;
    expect(error.status).toBe(500);
    expect(error.message).toBe("Internal Server Error");
  });

  it("encodes query parameters and sends JSON bodies", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(respond(200, {}));
    await api.putCase("cases dir", "case_1", { id: "x", state: "hi" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/cases/case_1?dir=cases+dir");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({ id: "x", state: "hi" });
  });
});
