import type { DatabaseSync } from "node:sqlite";
import type { ApiGoal, ApiPriority, ApiSummary, GoalDate, Health, PathToGreen, PrioritiesResponse, PtgStep } from "./api.ts";
import { dateIn, day, daysBetween } from "./dates.ts";
import { currentDate, goalDates, isOpen, OPEN_STATES, resolvedGoal, type State } from "./goal.ts";
import { read, readAll } from "./read.ts";
import type { Row } from "./rules.ts";

/**
 * The Priorities view (SPEC.md §8.2). Tig made it the default view on 2026-10-14.
 * This module reads the store and returns the api.ts contract: the selection, the tree, and the summary.
 * The React app lays it out, labels it, and filters it (ADR 0010).
 */

/**
 * The saved definition behind the screen. A stored view table is a later issue (#8, Epic 7).
 * The view opens on one org unit. It selects that unit's goals at that unit's level.
 */
const PRIORITIES_VIEW = {
  name: "Priorities",
  select: { state: OPEN_STATES, period: "current" },
  sort: "rank",
  columns: ["Summary", "Owner", "Health", "Date Type", "Promotion Milestone", "PTG"],
} as const;

/** A period is current when it names today's year ("2026") or quarter ("2026-Q4"). Calendar quarters are the default calendar (SPEC.md §12). */
export function isCurrentPeriod(period: string, todayIso: string): boolean {
  const year = todayIso.slice(0, 4);
  const quarter = Math.floor((Number(todayIso.slice(5, 7)) - 1) / 3) + 1;
  return period === year || period === `${year}-Q${quarter}`;
}

function all(db: DatabaseSync, sql: string, ...params: string[]): Row[] {
  return db.prepare(sql).all(...params) as Row[];
}

/** When each goal started, as a day in `timeZone`: its first move to In Progress, else its first Event. One query. */
function startedAll(db: DatabaseSync, timeZone: string): Map<string, string> {
  const rows = all(
    db,
    `SELECT entity,
       (SELECT timestamp FROM event m WHERE m.entity_kind = 'goal' AND m.entity = e.entity AND m.field = 'state' AND m.new = '"In Progress"' ORDER BY sequence LIMIT 1) AS moved,
       MIN(timestamp) AS first
     FROM event e WHERE entity_kind = 'goal' GROUP BY entity`,
  );
  return new Map(rows.map((r) => [r.entity as string, dateIn(Date.parse((r.moved ?? r.first) as string), timeZone)]));
}

/** When one goal started, as a day in `timeZone`. It reads that goal's Events through the event_by_entity index. */
export function startedOf(db: DatabaseSync, id: string, timeZone: string): string | undefined {
  const row = db
    .prepare(
      `SELECT (SELECT timestamp FROM event WHERE entity_kind = 'goal' AND entity = ? AND field = 'state' AND new = '"In Progress"' ORDER BY sequence LIMIT 1) AS moved,
         (SELECT MIN(timestamp) FROM event WHERE entity_kind = 'goal' AND entity = ?) AS first`,
    )
    .get(id, id) as Row;
  const at = (row.moved ?? row.first) as string | null;
  return at ? dateIn(Date.parse(at), timeZone) : undefined;
}

/** A goal's own date and Date Type, to compare a sub-goal with its parent. */
function ownDate(goal: Row): string {
  return `${goal.date_type} ${currentDate(goal)}`;
}

/** The first step of a Path to Green (SPEC.md §6.1, plan E-8). Home shows only that. */
function firstStep(ptg: unknown, names: Map<string, string>): PtgStep | undefined {
  const step = (ptg as Partial<PathToGreen> | null)?.steps?.[0];
  if (!step || typeof step.text !== "string") return undefined;
  return {
    text: step.text,
    ...(typeof step.owner === "string" ? { owner: { id: step.owner, name: names.get(step.owner) ?? step.owner } } : {}),
    ...(typeof step.date === "string" ? { date: step.date } : {}),
  };
}

/** The view on `todayIso`, the org's calendar day. Event timestamps are UTC instants, read as days in `timeZone`. */
export function prioritiesView(db: DatabaseSync, orgUnit: string, todayIso: string, timeZone: string): Omit<PrioritiesResponse, "me"> {
  const today = day(todayIso);
  const unit = read(db, "org_unit", orgUnit);
  const org = { id: orgUnit, name: (unit?.name as string) ?? orgUnit, level: (unit?.level as string) ?? "" };
  const { select, sort } = PRIORITIES_VIEW;

  // Load once and build from memory.
  const goals = new Map(readAll(db, "goal").map((g) => [g.id as string, g]));
  const getGoal = (id: string) => goals.get(id);
  /** A sub-goal with no date of its own reads its parent's (D2). */
  const resolved = (goal: Row) => resolvedGoal(goal, getGoal);
  const started = startedAll(db, timeZone);
  const names = new Map(readAll(db, "actor").map((a) => [a.id as string, a.display_name as string]));
  const actor = (id: string) => ({ id, name: names.get(id) ?? id });
  const shown = (g: Row) => g.org_unit === org.id && g.level === org.level && (select.state as readonly unknown[]).includes(g.state);
  const childrenOf = new Map<string, Row[]>();
  for (const g of goals.values()) {
    if (typeof g.parent === "string" && shown(g)) childrenOf.set(g.parent, [...(childrenOf.get(g.parent) ?? []), g]);
  }

  const priorities = readAll(db, "priority")
    .filter((p) => p.org_unit === orgUnit && p.status === "Current" && isCurrentPeriod(p.period as string, todayIso))
    .sort((a, b) => (a[sort] as number) - (b[sort] as number));
  const tops = priorities.map((p) =>
    [...goals.values()].filter((g) => g.priority === p.id && shown(g) && !(typeof g.parent === "string" && goals.get(g.parent)?.priority === p.id && shown(goals.get(g.parent) as Row))),
  );
  const inView = (g: Row): Row[] => [g, ...(childrenOf.get(g.id as string) ?? []).flatMap(inView)];

  const datesOf = (goal: Row, own: boolean): GoalDate[] => goalDates(goal, own, getGoal, todayIso);

  /** `funded` is true for a goal under a Priority above the cut line. */
  const goalOf = (goal: Row, funded: boolean, parent?: Row): ApiGoal => {
    const health = (goal.health as Health) ?? null;
    const ptg = health === "RED" || health === "YELLOW" ? firstStep(goal.path_to_green, names) : undefined;
    return {
      id: goal.id as string,
      summary: goal.summary as string,
      owner: actor(goal.owner as string),
      state: goal.state as State,
      health,
      dates: datesOf(resolved(goal), !parent || ownDate(resolved(goal)) !== ownDate(resolved(parent))),
      started: started.get(goal.id as string) ?? todayIso,
      ...(ptg ? { ptg } : {}),
      counted: funded && !parent && goal.state === "In Progress",
      children: (childrenOf.get(goal.id as string) ?? []).map((child) => goalOf(child, funded, goal)),
    };
  };

  const cut = priorities.findIndex((p) => p.cut_line === true);
  const built = tops.map((list, i) => list.map((g) => goalOf(g, cut === -1 || i <= cut)));
  const rows: ApiPriority[] = priorities.map((p, i) => ({ id: p.id as string, rank: p.rank as number, title: p.title as string, goals: built[i] }));
  const funded = cut === -1 ? rows : rows.slice(0, cut + 1);
  const backlog = cut === -1 ? [] : rows.slice(cut + 1);

  const top = funded.flatMap((p) => p.goals).filter((g) => g.counted);
  const slips = top.flatMap((g) => {
    const date = g.dates.find((d) => d.slipDays !== undefined);
    return date?.slipDays !== undefined ? [{ goal: g.id, summary: g.summary, date: date.date, kind: date.kind as "Committed" | "Promotion Milestone", days: date.slipDays }] : [];
  });
  const count = (h: Health) => top.filter((g) => g.health === h).length;
  // Until the Drafts slice, every stored Draft counts as open. The count covers the goals this view shows.
  const inThisView = new Set(tops.flat().flatMap(inView).map((g) => g.id));
  const drafts = readAll(db, "draft").filter((d) => inThisView.has(d.entity)).length;

  let nextPromotion: ApiSummary["nextPromotion"];
  for (const goal of tops.flat().flatMap(inView)) {
    const pm = resolved(goal).promotion_milestone;
    const milestone = typeof pm === "string" ? goals.get(pm) : undefined;
    if (!milestone || !isOpen(milestone)) continue;
    const date = currentDate(milestone);
    if (date === undefined || day(date) < today || (nextPromotion && day(date) >= day(nextPromotion.date))) continue;
    nextPromotion = { milestone: milestone.id as string, date, days: daysBetween(todayIso, date), goal: goal.id as string, summary: goal.summary as string };
  }

  return {
    org,
    today: todayIso,
    view: { name: PRIORITIES_VIEW.name, columns: PRIORITIES_VIEW.columns },
    funded,
    backlog,
    summary: {
      counts: { RED: count("RED"), YELLOW: count("YELLOW"), GREEN: count("GREEN") },
      healths: top.map((g) => g.health),
      slips,
      drafts,
      ...(nextPromotion ? { nextPromotion } : {}),
    },
  };
}
