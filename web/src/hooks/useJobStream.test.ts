import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useJobStream } from "./useJobStream";

type Listener = (event: MessageEvent) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  closed = false;
  onerror: ((event: Event) => void) | null = null;
  private listeners = new Map<string, Listener[]>();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  removeEventListener() {}

  close() {
    this.closed = true;
  }

  emit(type: string, data: unknown) {
    const message = new MessageEvent(type, { data: JSON.stringify(data) });
    for (const listener of this.listeners.get(type) ?? []) listener(message);
  }

  fail() {
    this.onerror?.(new Event("error"));
  }

  static last() {
    return MockEventSource.instances[MockEventSource.instances.length - 1];
  }
}

describe("useJobStream", () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubGlobal("EventSource", MockEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("does nothing without a job id", () => {
    renderHook(() => useJobStream(null));
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it("connects from offset 0 and accumulates lines and events", async () => {
    const { result } = renderHook(() => useJobStream("job-1"));
    const source = MockEventSource.last();
    expect(source.url).toBe("/api/jobs/job-1/events?offset=0");

    act(() => {
      source.emit("line", { offset: 0, text: "Generating 10 synthetic states..." });
      source.emit("event", { type: "generating", total: 10, line: 0 });
      source.emit("line", { offset: 1, text: "  generated 5/10" });
      source.emit("event", { type: "generated", n: 5, total: 10, line: 1 });
    });

    await waitFor(() => expect(result.current.lines).toHaveLength(2));
    expect(result.current.events.map((e) => e.type)).toEqual(["generating", "generated"]);
    expect(result.current.status).toBeNull();
  });

  it("closes on the status event and reports it", async () => {
    const { result } = renderHook(() => useJobStream("job-1"));
    const source = MockEventSource.last();
    act(() => {
      source.emit("line", { offset: 0, text: "hello" });
      source.emit("status", { status: "succeeded", returncode: 0 });
    });
    await waitFor(() => expect(result.current.status).toBe("succeeded"));
    expect(result.current.returncode).toBe(0);
    expect(source.closed).toBe(true);
  });

  it("reconnects from the last offset after an error without duplicating", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useJobStream("job-1"));
    const first = MockEventSource.last();
    act(() => {
      first.emit("line", { offset: 0, text: "a" });
      first.emit("line", { offset: 1, text: "b" });
      first.emit("event", { type: "warning", message: "x", line: 1 });
      first.fail();
    });
    expect(first.closed).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    const second = MockEventSource.last();
    expect(second).not.toBe(first);
    expect(second.url).toBe("/api/jobs/job-1/events?offset=2");

    act(() => {
      // a replayed line and event must be ignored
      second.emit("line", { offset: 1, text: "b" });
      second.emit("event", { type: "warning", message: "x", line: 1 });
      second.emit("line", { offset: 2, text: "c" });
      vi.advanceTimersByTime(200);
    });
    expect(result.current.lines).toEqual(["a", "b", "c"]);
    expect(result.current.events).toHaveLength(1);
  });

  it("closes the connection on unmount and resets on job change", async () => {
    const { result, rerender, unmount } = renderHook(({ id }) => useJobStream(id), {
      initialProps: { id: "job-1" },
    });
    const first = MockEventSource.last();
    act(() => first.emit("line", { offset: 0, text: "a" }));
    await waitFor(() => expect(result.current.lines).toEqual(["a"]));

    rerender({ id: "job-2" });
    expect(first.closed).toBe(true);
    await waitFor(() => expect(result.current.lines).toEqual([]));
    expect(MockEventSource.last().url).toBe("/api/jobs/job-2/events?offset=0");

    unmount();
    expect(MockEventSource.last().closed).toBe(true);
  });
});
