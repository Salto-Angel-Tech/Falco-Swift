import { useEffect, useState } from "react";
import { jobEventsUrl } from "../api/client";
import type { JobEvent, JobStatus } from "../api/types";

export interface JobStream {
  lines: string[];
  events: JobEvent[];
  status: JobStatus | null;
  returncode: number | null;
  connected: boolean;
}

const EMPTY: JobStream = { lines: [], events: [], status: null, returncode: null, connected: false };
const FLUSH_MS = 100;
const RECONNECT_MS = 1000;

function parse<T>(event: MessageEvent): T | null {
  try {
    return JSON.parse(event.data as string) as T;
  } catch {
    return null;
  }
}

/**
 * Follow a job's output over SSE. Lines and parser events are buffered and flushed at most
 * every FLUSH_MS so a long backlog does not render once per line. On a connection error the
 * stream is reopened from the next unseen offset; replayed lines/events are ignored. The
 * EventSource is closed as soon as the final `status` event arrives so the browser does not
 * reconnect on its own.
 */
export function useJobStream(jobId: string | null): JobStream {
  const [state, setState] = useState<JobStream>(EMPTY);

  useEffect(() => {
    setState(EMPTY);
    if (!jobId) return;

    let nextOffset = 0;
    let lastEventLine = -1;
    let finished = false;
    let disposed = false;
    let source: EventSource | null = null;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingLines: string[] = [];
    let pendingEvents: JobEvent[] = [];
    let pendingStatus: { status: JobStatus; returncode: number | null } | null = null;
    let pendingConnected: boolean | null = null;

    const flush = () => {
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = null;
      if (disposed) return;
      const lines = pendingLines;
      const events = pendingEvents;
      const status = pendingStatus;
      const connected = pendingConnected;
      pendingLines = [];
      pendingEvents = [];
      pendingStatus = null;
      pendingConnected = null;
      if (!lines.length && !events.length && !status && connected === null) return;
      setState((prev) => ({
        lines: lines.length ? [...prev.lines, ...lines] : prev.lines,
        events: events.length ? [...prev.events, ...events] : prev.events,
        status: status ? status.status : prev.status,
        returncode: status ? status.returncode : prev.returncode,
        connected: connected ?? prev.connected,
      }));
    };

    const scheduleFlush = () => {
      if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
    };

    const connect = () => {
      const es = new EventSource(jobEventsUrl(jobId, nextOffset));
      source = es;
      es.addEventListener("open", () => {
        pendingConnected = true;
        scheduleFlush();
      });
      es.addEventListener("line", (message) => {
        const data = parse<{ offset: number; text: string }>(message as MessageEvent);
        if (!data || data.offset < nextOffset) return;
        nextOffset = data.offset + 1;
        pendingLines.push(data.text);
        scheduleFlush();
      });
      es.addEventListener("event", (message) => {
        const data = parse<JobEvent>(message as MessageEvent);
        if (!data || typeof data.line !== "number" || data.line <= lastEventLine) return;
        lastEventLine = data.line;
        pendingEvents.push(data);
        scheduleFlush();
      });
      es.addEventListener("status", (message) => {
        const data = parse<{ status: JobStatus; returncode: number | null }>(
          message as MessageEvent,
        );
        finished = true;
        es.close();
        pendingStatus = data ?? { status: "failed", returncode: null };
        pendingConnected = false;
        flush();
      });
      es.onerror = () => {
        es.close();
        if (finished || disposed) return;
        pendingConnected = false;
        scheduleFlush();
        reconnectTimer = setTimeout(connect, RECONNECT_MS);
      };
    };

    connect();

    return () => {
      disposed = true;
      source?.close();
      if (flushTimer) clearTimeout(flushTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [jobId]);

  return state;
}
