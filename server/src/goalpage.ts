import type { DatabaseSync } from "node:sqlite";
import type { ApiEvent, ApiWorkItem, GoalDate, GoalEventsResponse, GoalPageResponse, GoalRef, Health, StoredGoal, SubGoalCard } from "./api.ts";
import { toApiEvent } from "./live.ts";
import { toApiWorkItem } from "./work.ts";
import { above, changers, closesAs, closesAsPromoted, currentDate, mayChangeGoal, goalDates, isOpen, judgedDate, resolvedGoal, uncommittedDate, type State } from "./goal.ts";
import { startedOf } from "./priorities.ts";
import { actorsById, countEntityEvents, goalieOwner, milestonesOf, read, readAll, readEntityEvents, workItemsOn, type EntityRefs } from "./read.ts";
import { goalLints, type Row } from "./rules.ts";

/**
 * The goal page (plan B3, design G1 to G24). One read per kind into Maps, then the response. No query per row.
 * It returns plain data. The app lays it out and labels it.
 */

const isLive = (item: Row) => item.status !== "Deleted";
const goalRef = (goal: Row): GoalRef => ({ id: goal.id as string, summary: goal.summary as string });

/** D1: a history this long or shorter is sent whole. A longer one is sent a page at a time, newest first. */
const HISTORY_WHOLE = 1_000;
const HISTORY_PAGE = 100;

/** A goal's history: the goal, every goal that is or was its Promotion Milestone (N6a), and its work items. */
function historyOf(db: DatabaseSync, stored: Row, itemIds: string[]): EntityRefs {
  return [{ kind: "goal", ids: [stored.id as string, ...milestonesOf(db, stored)] }, { kind: "work_item", ids: itemIds }];
}

/** GET /api/goals/:id/events: the next page of the goal's history, older than `before`. */
export function goalEvents(db: DatabaseSync, id: string, before: number): GoalEventsResponse | undefined {
  const stored = read(db, "goal", id);
  if (stored === undefined) return undefined;
  const itemIds = workItemsOn(db) ? readAll(db, "work_item").filter((w) => w.goal === id).map((w) => w.id as string) : [];
  // One more than a page, to know whether older Events wait.
  const rows = readEntityEvents(db, historyOf(db, stored, itemIds), { before, limit: HISTORY_PAGE + 1 });
  const events = rows.slice(0, HISTORY_PAGE).map(toApiEvent);
  return { events, olderEvents: rows.length > HISTORY_PAGE ? events[events.length - 1].sequence : null };
}

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

  // GP2-12: goals are read in key order, so the first that names this goal as its Promotion Milestone is the lowest key.
  const backer = [...goals.values()].find((g) => g.promotion_milestone === id);

  const pmId = goal.promotion_milestone;
  const pm = typeof pmId === "string" ? goals.get(pmId) : undefined;
  const promotionMilestone = pm && {
    id: pm.id as string,
    summary: pm.summary as string,
    version: pm.version as number,
    state: pm.state as State,
    health: (pm.health as Health) ?? null,
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
  const history = historyOf(db, stored, itemIds);
  const counts = countEntityEvents(db, history);
  // D1: past 1,000 Events the page sends the newest 100, and the app asks for the rest (Codebase QA: 4,327 KB at 3,000 comments).
  const paged = counts.events > HISTORY_WHOLE;
  const events: ApiEvent[] = readEntityEvents(db, history, paged ? { before: Number.MAX_SAFE_INTEGER, limit: HISTORY_PAGE } : undefined).map(toApiEvent);

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
    started: startedOf(db, id, timeZone) ?? null,
    closesAs: closing,
    closesAsPromoted: closesAsPromoted(stored, today),
    mayChange: mayChangeGoal(me, goalieOwner(db), stored, getGoal),
    above: above(stored, getGoal),
    siblings: typeof stored.parent === "string" ? childrenOf(stored.parent).filter((g) => g.id !== id).map(goalRef) : [],
    backs: backer ? goalRef(backer) : null,
    changers: who.list,
    moreChangers: who.more,
    promotionMilestone: promotionMilestone ?? null,
    parent: parent ? goalRef(parent) : null,
    priority: priority ? { id: priority.id as string, rank: priority.rank as number, title: priority.title as string } : null,
    orgUnit: { id: stored.org_unit as string, name: (unit?.name as string) ?? (stored.org_unit as string), level: (unit?.level as string) ?? "" },
    subGoals,
    workItems,
    events,
    olderEvents: paged ? events[events.length - 1].sequence : null,
    eventCount: counts.events,
    commentCount: counts.comments,
    needsYou: {
      lateWorkItems: (workItems ?? []).filter((w) => w.late && w.owner === me).map((w) => w.id),
      missingPtg: stored.owner === me && (health === "YELLOW" || health === "RED") && stored.path_to_green == null,
    },
    hints: goalLints(stored),
    actors,
  };
}
