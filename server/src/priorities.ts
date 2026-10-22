import type { DatabaseSync } from "node:sqlite";
import { committedDate, currentDate, OPEN_STATES } from "./goal.ts";
import { read, readAll } from "./read.ts";
import type { Row } from "./rules.ts";

/**
 * The Priorities view (SPEC.md §8.2), drawn as a timeline. Tig made it the default view on 2026-10-14.
 * This module reads the store and returns plain data. home.ts draws it.
 */

/**
 * The saved definition behind the screen. A stored view table is a later issue (#8, Epic 7).
 * The view opens on one org unit. It selects that unit's goals at that unit's level.
 */
export const PRIORITIES_VIEW = {
  name: "Priorities",
  select: { state: OPEN_STATES, period: "current" },
  sort: "rank",
  columns: ["Summary", "Owner", "Health", "Date Type", "Promotion Milestone", "PTG"],
} as const;

const DAY = 86_400_000;
const WEEKS = 13;
/** Today stays at least this many days inside the right edge of the window. */
const AHEAD_DAYS = 28;

export type Health = "GREEN" | "YELLOW" | "RED" | null;

export type Mark = {
  at: number;
  label: string;
  kind: "Committed" | "Promotion Milestone" | "Ambition" | "Fantasy";
  /** Which edge of the window the date lies past, if any. */
  outside: "before" | "after" | null;
};

export type Lane = {
  /** Percent positions across the window. */
  health?: { from: number; to: number };
  ahead?: { from: number; to: number };
  slip?: { from: number; to: number; days: number };
  tick?: Mark;
  line?: { from: number; to: number; kind: "Ambition" | "Fantasy" };
  end?: Mark;
};

/** The first step of a Path to Green. */
export type PtgStep = { text: string; ownerName?: string; date?: string };

export type GoalRow = {
  id: string;
  summary: string;
  owner: string;
  ownerName: string;
  state: string;
  health: Health;
  depth: number;
  /** The row's dates, for a screen too narrow for the lane. Empty when a sub-goal has its parent's date. */
  when: string[];
  lane: Lane;
  ptg?: PtgStep;
  children: GoalRow[];
};

export type PriorityRow = { id: string; rank: number; title: string; goals: GoalRow[] };

export type Summary = {
  committed: { counts: { RED: number; YELLOW: number; GREEN: number }; healths: Health[]; slips: { id: string; summary: string; date: string; days: number }[] };
  drafts: number;
  nextPromotion?: { milestone: string; date: string; days: number; goal: string; summary: string };
};

export type PrioritiesView = {
  org: { id: string; name: string; level: string };
  today: string;
  weeks: { at: number; label: string }[];
  todayAt: number;
  funded: PriorityRow[];
  backlog: PriorityRow[];
  summary: Summary;
};

function day(iso: string): number {
  return Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
}

const MONTH_DAY = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
const MONTH_DAY_YEAR = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** "Oct 1", or "Mar 31, 2027" outside the current year. */
export function shortDate(iso: string, todayIso: string): string {
  const format = iso.slice(0, 4) === todayIso.slice(0, 4) ? MONTH_DAY : MONTH_DAY_YEAR;
  return format.format(day(iso));
}

/** A period is current when it names today's year ("2026") or quarter ("2026-Q4"). Calendar quarters are the default calendar (SPEC.md §12). */
export function isCurrentPeriod(period: string, todayIso: string): boolean {
  const year = todayIso.slice(0, 4);
  const quarter = Math.floor((Number(todayIso.slice(5, 7)) - 1) / 3) + 1;
  return period === year || period === `${year}-Q${quarter}`;
}

function all(db: DatabaseSync, sql: string, ...params: string[]): Row[] {
  return db.prepare(sql).all(...params) as Row[];
}

/** When each goal started: its first move to In Progress, else its first Event. One query. */
function startedAll(db: DatabaseSync): Map<string, string> {
  const rows = all(
    db,
    `SELECT entity,
       (SELECT timestamp FROM event m WHERE m.entity_kind = 'goal' AND m.entity = e.entity AND m.field = 'state' AND m.new = '"In Progress"' ORDER BY sequence LIMIT 1) AS moved,
       MIN(timestamp) AS first
     FROM event e WHERE entity_kind = 'goal' GROUP BY entity`,
  );
  return new Map(rows.map((r) => [r.entity as string, (r.moved ?? r.first) as string]));
}

/** A goal's own date and Date Type, to compare a sub-goal with its parent. */
function ownDate(goal: Row): string {
  return `${goal.date_type} ${currentDate(goal)}`;
}

function firstStep(ptg: unknown, names: Map<string, string>): PtgStep | undefined {
  if (typeof ptg === "string") return ptg ? { text: ptg } : undefined;
  const step = (ptg as { steps?: { text?: unknown; owner?: unknown; date?: unknown }[] } | null)?.steps?.[0];
  if (!step || typeof step.text !== "string") return undefined;
  return {
    text: step.text,
    ownerName: typeof step.owner === "string" ? (names.get(step.owner) ?? step.owner) : undefined,
    date: typeof step.date === "string" ? step.date : undefined,
  };
}

export function prioritiesView(db: DatabaseSync, orgUnit: string, now: Date = new Date()): PrioritiesView {
  const todayIso = now.toISOString().slice(0, 10);
  const today = day(todayIso);
  const unit = read(db, "org_unit", orgUnit);
  const org = { id: orgUnit, name: (unit?.name as string) ?? orgUnit, level: (unit?.level as string) ?? "" };
  const { select, sort } = PRIORITIES_VIEW;

  // Load once and build from memory.
  const goals = new Map(readAll(db, "goal").map((g) => [g.id as string, g]));
  const getGoal = (id: string) => goals.get(id);
  const started = startedAll(db);
  const names = new Map(readAll(db, "actor").map((a) => [a.id as string, a.display_name as string]));
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

  // The window starts two weeks back, or earlier for a passed Committed date of a goal in the view.
  // Today stays inside it. Weeks start on Monday.
  const inView = (g: Row): Row[] => [g, ...(childrenOf.get(g.id as string) ?? []).flatMap(inView)];
  const passed = tops
    .flat()
    .flatMap(inView)
    .filter((g) => g.state === "In Progress")
    .map((g) => committedDate(g, getGoal))
    .filter((c): c is NonNullable<typeof c> => c !== undefined)
    .map((c) => day(c.date) - 3 * DAY);
  const from = Math.max(Math.min(today - 14 * DAY, ...passed), today - (WEEKS * 7 - AHEAD_DAYS) * DAY);
  const start = from - ((new Date(from).getUTCDay() + 6) % 7) * DAY;
  const end = start + WEEKS * 7 * DAY;
  const pos = (t: number) => (100 * (Math.min(Math.max(t, start), end) - start)) / (end - start);
  const outside = (t: number): Mark["outside"] => (t < start ? "before" : t > end ? "after" : null);

  const lane = (goal: Row, drawDate: boolean): Lane => {
    const result: Lane = {};
    const begun = day(started.get(goal.id as string) ?? todayIso);
    const committed = committedDate(goal, getGoal);
    const c = committed ? day(committed.date) : undefined;
    if (goal.state === "In Progress" && goal.health) result.health = { from: pos(begun), to: pos(Math.min(today, c ?? today)) };
    if (c !== undefined && committed) {
      if (c < today) result.slip = { from: pos(c), to: pos(today), days: Math.round((today - c) / DAY) };
      else if (drawDate) result.ahead = { from: pos(Math.max(today, begun)), to: pos(c) };
      if (drawDate || result.slip) result.tick = { at: pos(c), label: `${committed.kind} ${shortDate(committed.date, todayIso)}`, kind: committed.kind, outside: outside(c) };
    }
    if (drawDate && (goal.date_type === "Ambition" || goal.date_type === "Fantasy")) {
      const kind = goal.date_type;
      const f = day(goal.due_date as string);
      const mark: Mark = { at: pos(f), label: `${kind} ${shortDate(goal.due_date as string, todayIso)}`, kind, outside: outside(f) };
      result.line = { from: pos(c ?? today), to: mark.at, kind };
      result.end = mark;
    }
    return result;
  };

  const goalRow = (goal: Row, depth: number, parent?: Row): GoalRow => {
    const l = lane(goal, !parent || ownDate(goal) !== ownDate(parent));
    const health = (goal.health as Health) ?? null;
    return {
      id: goal.id as string,
      summary: goal.summary as string,
      owner: goal.owner as string,
      ownerName: names.get(goal.owner as string) ?? (goal.owner as string),
      state: goal.state as string,
      health,
      depth,
      lane: l,
      when: [l.tick?.label, l.end?.label].filter((w): w is string => Boolean(w)),
      ...(health === "RED" || health === "YELLOW" ? { ptg: firstStep(goal.path_to_green, names) } : {}),
      children: (childrenOf.get(goal.id as string) ?? []).map((child) => goalRow(child, depth + 1, goal)),
    };
  };

  const rows: PriorityRow[] = priorities.map((p, i) => ({
    id: p.id as string,
    rank: p.rank as number,
    title: p.title as string,
    goals: tops[i].map((g) => goalRow(g, 0)),
  }));
  const cut = priorities.findIndex((p) => p.cut_line === true);
  const funded = cut === -1 ? rows : rows.slice(0, cut + 1);
  const backlog = cut === -1 ? [] : rows.slice(cut + 1);

  const top = funded.flatMap((p) => p.goals).filter((g) => g.state === "In Progress");
  const slips = top
    .filter((g) => g.lane.slip)
    .map((g) => ({ id: g.id, summary: g.summary, date: g.lane.tick?.label ?? "", days: g.lane.slip?.days ?? 0 }));
  const count = (h: Health) => top.filter((g) => g.health === h).length;
  // Until the Drafts slice, every stored Draft counts as open.
  const drafts = (db.prepare("SELECT COUNT(*) AS n FROM draft").get() as { n: number }).n;

  let nextPromotion: Summary["nextPromotion"];
  for (const goal of tops.flat().flatMap(inView)) {
    const milestone = typeof goal.promotion_milestone === "string" ? goals.get(goal.promotion_milestone) : undefined;
    if (!milestone || !(OPEN_STATES as readonly unknown[]).includes(milestone.state)) continue;
    const date = currentDate(milestone);
    if (date === undefined || day(date) < today || (nextPromotion && day(date) >= day(nextPromotion.date))) continue;
    nextPromotion = { milestone: milestone.id as string, date, days: Math.round((day(date) - today) / DAY), goal: goal.id as string, summary: goal.summary as string };
  }

  const weeks = Array.from({ length: WEEKS }, (_, i) => {
    const t = start + i * 7 * DAY;
    return { at: pos(t), label: shortDate(new Date(t).toISOString().slice(0, 10), todayIso) };
  });
  return {
    org,
    today: todayIso,
    weeks,
    todayAt: pos(today),
    funded,
    backlog,
    summary: {
      committed: { counts: { RED: count("RED"), YELLOW: count("YELLOW"), GREEN: count("GREEN") }, healths: top.map((g) => g.health), slips },
      drafts,
      nextPromotion,
    },
  };
}
