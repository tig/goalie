import type { DatabaseSync } from "node:sqlite";
import type { ApiActor, ApiEvent, ApiWorkItem, GoalDate, GoalPageResponse, Health, StoredGoal, SubGoalCard } from "./api.ts";
import { toApiWorkItem } from "./commands.ts";
import { toApiEvent } from "./live.ts";
import { day, daysBetween } from "./dates.ts";
import { closesAs, committedDate, currentDate, goalDates, isOpen, resolvedGoal, type State } from "./goal.ts";
import { startedAll } from "./priorities.ts";
import { read, readAll, type EventRow } from "./read.ts";
import { goalLints, type Row } from "./rules.ts";

/**
 * The goal page (plan B3, design G1 to G24). One read per kind into Maps, then the response. No query per row.
 * It returns plain data. The app lays it out and labels it.
 */

/** Every actor, by id, with its kind (SPEC.md §6.4). */
export function actorsById(db: DatabaseSync): Record<string, ApiActor> {
  return Object.fromEntries(readAll(db, "actor").map((a) => [a.id, { id: a.id as string, name: a.display_name as string, kind: a.kind as ApiActor["kind"] }]));
}

/** True when the owner setting work_items is on (D7). */
export function workItemsOn(db: DatabaseSync): boolean {
  return (read(db, "owner_settings", "owner")?.settings as Row | undefined)?.work_items === true;
}

const isLive = (item: Row) => item.status !== "Deleted";

export function goalPage(db: DatabaseSync, id: string, me: string, today: string, timeZone: string): GoalPageResponse | undefined {
  const goals = new Map(readAll(db, "goal").map((g) => [g.id as string, g]));
  const stored = goals.get(id);
  if (stored === undefined) return undefined;
  const getGoal = (key: string) => goals.get(key);
  const goal = resolvedGoal(stored, getGoal);
  const actors = actorsById(db);
  const on = workItemsOn(db);
  const items = on ? readAll(db, "work_item") : [];
  const itemsOf = (key: string) => items.filter((w) => w.goal === key);
  const childrenOf = (key: string) => [...goals.values()].filter((g) => g.parent === key);
  /** A goal and every goal under it. */
  const tree = (key: string): string[] => [key, ...childrenOf(key).flatMap((g) => tree(g.id as string))];

  // G5: the date health is judged on first, then the goal's own uncommitted date.
  const judged = committedDate(stored, getGoal);
  const dates: GoalDate[] = [];
  if (judged) {
    const slipDays = day(judged.date) < day(today) && isOpen(stored) ? daysBetween(judged.date, today) : undefined;
    dates.push(slipDays === undefined ? judged : { ...judged, slipDays });
  }
  if (goal.date_type === "Ambition" || goal.date_type === "Fantasy") dates.push({ date: goal.due_date as string, kind: goal.date_type });

  // G15: the state a close records now. One home: goal.ts closesAs, which rules.ts checks too.
  const closing = stored.state === "In Progress" ? closesAs(goal, today) : null;

  const pmId = goal.promotion_milestone;
  const pm = typeof pmId === "string" ? goals.get(pmId) : undefined;
  const promotionMilestone = pm && {
    id: pm.id as string,
    summary: pm.summary as string,
    state: pm.state as State,
    date: currentDate(pm) as string,
    openSubGoals: childrenOf(pm.id as string).filter(isOpen).length,
    openWorkItems: tree(pm.id as string).flatMap(itemsOf).filter((w) => w.status !== "Completed" && isLive(w)).length,
  };

  const subGoals: SubGoalCard[] = childrenOf(id).map((child) => {
    const resolved = resolvedGoal(child, getGoal);
    const own = `${resolved.date_type} ${currentDate(resolved)}` !== `${goal.date_type} ${currentDate(goal)}`;
    const live = itemsOf(child.id as string).filter(isLive);
    return {
      id: child.id as string,
      summary: child.summary as string,
      owner: child.owner as string,
      state: child.state as State,
      health: (child.health as Health) ?? null,
      dates: goalDates(resolved, own, getGoal, today),
      promotionMilestone: stored.promotion_milestone === child.id,
      subGoals: childrenOf(child.id as string).length,
      ...(on ? { workItems: { completed: live.filter((w) => w.status === "Completed").length, total: live.length } } : {}),
    };
  });

  const workItems: ApiWorkItem[] | null = on ? itemsOf(id).map((w) => toApiWorkItem(w, today)) : null;
  const itemIds = (workItems ?? []).map((w) => w.id);
  const events: ApiEvent[] = (
    db
      .prepare(
        `SELECT * FROM event WHERE (entity_kind = 'goal' AND entity = ?) OR (entity_kind = 'work_item' AND entity IN (SELECT value FROM json_each(?))) ORDER BY sequence DESC`,
      )
      .all(id, JSON.stringify(itemIds)) as Row[]
  ).map((row) => toApiEvent({ ...row, old: row.old == null ? null : JSON.parse(row.old as string), new: row.new == null ? null : JSON.parse(row.new as string) } as EventRow));

  const unit = read(db, "org_unit", stored.org_unit as string);
  const priority = typeof stored.priority === "string" ? read(db, "priority", stored.priority) : undefined;
  const parent = typeof stored.parent === "string" ? goals.get(stored.parent) : undefined;
  const health = (stored.health as Health) ?? null;
  return {
    me: actors[me],
    today,
    goal: stored as StoredGoal,
    dates,
    inherited: goal.inherited,
    started: startedAll(db, timeZone).get(id) ?? today,
    closesAs: closing,
    promotionMilestone: promotionMilestone ?? null,
    parent: parent ? { id: parent.id as string, summary: parent.summary as string } : null,
    priority: priority ? { id: priority.id as string, rank: priority.rank as number, title: priority.title as string } : null,
    orgUnit: { id: stored.org_unit as string, name: (unit?.name as string) ?? (stored.org_unit as string), level: (unit?.level as string) ?? "" },
    subGoals,
    workItems,
    events,
    needsYou: {
      lateWorkItems: (workItems ?? []).filter((w) => w.late && w.owner === me).map((w) => w.id),
      missingPtg: stored.owner === me && (health === "YELLOW" || health === "RED") && stored.path_to_green == null,
    },
    hints: goalLints(stored),
    actors,
  };
}
