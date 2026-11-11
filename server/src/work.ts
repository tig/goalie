import type { DatabaseSync } from "node:sqlite";
import type { ApiWorkItem, WorkItemPageResponse, WorkResponse } from "./api.ts";
import { githubError, githubRepos, reposOnGoal } from "./github.ts";
import { toApiEvent } from "./live.ts";
import { actorsById, read, readAll, readEntityEvents, workItemsOn } from "./read.ts";
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
    .map((w) => toApiWorkItem(db, w, today));
  const named = new Set(items.map((w) => w.goal));
  const goals = Object.fromEntries(readAll(db, "goal").filter((g) => named.has(g.id as string)).map((g) => [g.id, { id: g.id as string, summary: g.summary as string }]));
  return { me: actors[me], today, items, goals, actors, githubScope: githubRepos(db) };
}

/** W8: one work item's page. Undefined when there is no such item, or the work-item extension is off. */
export function workItemPage(db: DatabaseSync, key: string, me: string, today: string): WorkItemPageResponse | undefined {
  if (!workItemsOn(db)) return undefined;
  const row = read(db, "work_item", key.toUpperCase());
  if (row === undefined) return undefined;
  const item = toApiWorkItem(db, row, today);
  const goal = read(db, "goal", item.goal);
  const events = readEntityEvents(db, [{ kind: "work_item", ids: [item.id] }]).map(toApiEvent);
  return {
    me: actorsById(db)[me],
    today,
    item,
    goal: { id: item.goal, summary: (goal?.summary as string) ?? item.goal },
    actors: actorsById(db),
    events,
    githubRepos: reposOnGoal(db, item.goal),
    githubScope: githubRepos(db),
  };
}

/** A stored work item, with `late` when it is open and its due date has passed. */
export function toApiWorkItem(db: DatabaseSync, row: Row, today: string): ApiWorkItem {
  const open = row.status !== "Completed" && row.status !== "Deleted";
  const github_error = githubError(db, String(row.id));
  const item = { ...(row as Omit<ApiWorkItem, "late" | "github_error">), late: open && typeof row.due_date === "string" && row.due_date < today };
  return github_error === null ? item : { ...item, github_error };
}
