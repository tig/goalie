import type { DatabaseSync } from "node:sqlite";
import type { ApiEvent, ApiWorkItem, GoalDate, GoalPageResponse, Health, StoredGoal, SubGoalCard } from "./api.ts";
import { toApiEvent } from "./live.ts";
import { toApiWorkItem } from "./work.ts";
import { above, changers, closesAs, closesAsPromoted, currentDate, mayChangeGoal, goalDates, isOpen, judgedDate, resolvedGoal, uncommittedDate, type State } from "./goal.ts";
import { startedOf } from "./priorities.ts";
import { actorsById, goalieOwner, read, readAll, readEntityEvents, workItemsOn } from "./read.ts";
import { goalLints, type Row } from "./rules.ts";

/**
 * The goal page (plan B3, design G1 to G24). One read per kind into Maps, then the response. No query per row.
 * It returns plain data. The app lays it out and labels it.
 */

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
  const children = new Map<string, Row[]>();
  for (const g of goals.values()) if (typeof g.parent === "string") children.set(g.parent, [...(children.get(g.parent) ?? []), g]);
  const childrenOf = (key: string) => children.get(key) ?? [];
  /** A goal and every goal under it. */
  const tree = (key: string): string[] => [key, ...childrenOf(key).flatMap((g) => tree(g.id as string))];

  // G5: the date health is judged on first, then the goal's own uncommitted date.
  const judged = judgedDate(stored, getGoal, today);
  const dates: GoalDate[] = [...(judged ? [judged] : []), ...uncommittedDate(goal)];

  // G15: the state a close records now. One home: goal.ts closesAs, which rules.ts checks too.
  const closing = stored.state === "In Progress" ? closesAs(goal, today) : null;

  const pmId = goal.promotion_milestone;
  const pm = typeof pmId === "string" ? goals.get(pmId) : undefined;
  const promotionMilestone = pm && {
    id: pm.id as string,
    summary: pm.summary as string,
    version: pm.version as number,
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
  // N6a: the history holds every goal that is or was this goal's Promotion Milestone, so a Promote row can name the one it completed.
  const own = readEntityEvents(db, [{ kind: "goal", ids: [id] }]);
  const milestones = new Set<string>(typeof stored.promotion_milestone === "string" ? [stored.promotion_milestone] : []);
  for (const e of own) if (e.field === "promotion_milestone") for (const v of [e.old, e.new]) if (typeof v === "string") milestones.add(v);
  milestones.delete(id);
  // Codebase QA Q14: the goal's own Events are read once, and only the others are read again.
  const events: ApiEvent[] = [...own, ...readEntityEvents(db, [{ kind: "goal", ids: [...milestones] }, { kind: "work_item", ids: itemIds }])]
    .sort((a, b) => b.sequence - a.sequence)
    .map(toApiEvent);

  const unit = read(db, "org_unit", stored.org_unit as string);
  const priority = typeof stored.priority === "string" ? read(db, "priority", stored.priority) : undefined;
  const parent = typeof stored.parent === "string" ? goals.get(stored.parent) : undefined;
  const health = (stored.health as Health) ?? null;
  const who = changers(stored, goalieOwner(db), getGoal);
  return {
    me: actors[me],
    today,
    goal: stored as StoredGoal,
    dates,
    inherited: goal.inherited,
    started: startedOf(db, id, timeZone) ?? today,
    closesAs: closing,
    closesAsPromoted: closesAsPromoted(stored, today),
    mayChange: mayChangeGoal(me, goalieOwner(db), stored, getGoal),
    above: above(stored, getGoal),
    changers: who.list,
    moreChangers: who.more,
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
