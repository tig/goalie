import type { DatabaseSync } from "node:sqlite";
import type { ApiWorkItem, WorkResponse } from "./api.ts";
import { actorsById, readAll } from "./read.ts";
import type { Row } from "./rules.ts";

/**
 * The build team's queues (plan B4): every work item, or one actor's, with the goals and actors they name.
 * The app groups them: My work by status, the team view by owner, then status.
 */
export function workQueue(db: DatabaseSync, me: string, today: string, owner?: string): WorkResponse {
  const actors = actorsById(db);
  // U4: a human's queue holds their own items and those of every agent they operate. Each item keeps its own owner.
  const queue = (who: string) => who === owner || (actors[owner as string]?.kind === "human" && actors[who]?.operator === owner);
  const items = readAll(db, "work_item")
    .filter((w) => owner === undefined || queue(w.owner as string))
    .map((w) => toApiWorkItem(w, today));
  const named = new Set(items.map((w) => w.goal));
  const goals = Object.fromEntries(readAll(db, "goal").filter((g) => named.has(g.id as string)).map((g) => [g.id, { id: g.id as string, summary: g.summary as string }]));
  return { me: actors[me], today, items, goals, actors };
}

/** A stored work item, with `late` when it is open and its due date has passed. */
export function toApiWorkItem(row: Row, today: string): ApiWorkItem {
  const open = row.status !== "Completed" && row.status !== "Deleted";
  return { ...(row as Omit<ApiWorkItem, "late">), late: open && typeof row.due_date === "string" && row.due_date < today };
}
