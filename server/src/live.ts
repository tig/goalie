import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import type { DatabaseSync } from "node:sqlite";
import type { ApiEvent } from "./api.ts";
import { readEvents, type EventRow } from "./read.ts";

/**
 * Live updates (ADR 0007, plan B5). One process keeps the open streams. A committed batch publishes its Events once, after the outer COMMIT.
 * A write from cli.ts runs in another process and is not pushed; the seats write through the API.
 */

export function toApiEvent(event: EventRow): ApiEvent {
  return { ...event, entity_kind: event.entity_kind as ApiEvent["entity_kind"] };
}

type Listener = (events: ApiEvent[]) => void;
const listeners = new Set<Listener>();

/** The kinds the app reads live. */
const LIVE_KINDS = new Set(["goal", "work_item"]);

/** A comment line this often keeps the host proxy from closing an idle stream. */
const HEARTBEAT_MS = 15_000;

/** Send committed Events to every open stream. Call only after the outer COMMIT. */
export function publish(events: ApiEvent[]): void {
  const live = events.filter((e) => LIVE_KINDS.has(e.entity_kind));
  if (live.length > 0) for (const listener of listeners) listener(live);
}

/** GET /api/events. With Last-Event-ID, every Event after it from the log first, in order, then the live ones. */
export function eventStream(c: Context, db: DatabaseSync): Response {
  const after = Number(c.req.header("Last-Event-ID") ?? Number.NaN);
  return streamSSE(c, async (stream) => {
    // Listen before reading the log, so an Event committed in between is queued, not lost.
    const queued: ApiEvent[] = [];
    let wake: (() => void) | undefined;
    const listener: Listener = (events) => {
      queued.push(...events);
      wake?.();
    };
    listeners.add(listener);
    stream.onAbort(() => {
      listeners.delete(listener);
      wake?.();
    });
    let last = Number.isInteger(after) && after >= 0 ? after : Number.POSITIVE_INFINITY;
    if (last !== Number.POSITIVE_INFINITY) queued.unshift(...readEvents(db, last).map(toApiEvent).filter((e) => LIVE_KINDS.has(e.entity_kind)));
    else last = 0;
    const heartbeat = setInterval(() => void stream.write(": ping\n\n"), HEARTBEAT_MS);
    try {
      while (!stream.aborted) {
        for (const event of queued.splice(0)) {
          if (event.sequence <= last) continue;
          last = event.sequence;
          await stream.writeSSE({ id: String(event.sequence), data: JSON.stringify(event) });
        }
        await new Promise<void>((resolve) => (wake = resolve));
        wake = undefined;
      }
    } finally {
      clearInterval(heartbeat);
      listeners.delete(listener);
    }
  });
}
