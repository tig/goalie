import type { DatabaseSync } from "node:sqlite";
import type { WorkResponse } from "./api.ts";
import { toApiWorkItem } from "./commands.ts";
import { actorsById } from "./goalpage.ts";
import { readAll } from "./read.ts";

/**
 * The build team's queues (plan B4): every work item, or one actor's, with the goals and actors they name.
 * The app groups them: My work by status, the team view by owner, then status.
 */
export function workQueue(db: DatabaseSync, me: string, today: string, owner?: string): WorkResponse {
  const items = readAll(db, "work_item")
    .filter((w) => owner === undefined || w.owner === owner)
    .map((w) => toApiWorkItem(w, today));
  const named = new Set(items.map((w) => w.goal));
  const goals = Object.fromEntries(readAll(db, "goal").filter((g) => named.has(g.id as string)).map((g) => [g.id, { id: g.id as string, summary: g.summary as string }]));
  const actors = actorsById(db);
  return { me: actors[me], today, items, goals, actors };
}
