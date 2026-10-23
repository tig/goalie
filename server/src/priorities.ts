import type { DatabaseSync } from "node:sqlite";
import { committedDate, currentDate, isDate, isOpen, OPEN_STATES } from "./goal.ts";
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
/** The board draws this many weeks before and after the week it opens on, and scrolls sideways through them. */
const PAST_WEEKS = 26;
const FUTURE_WEEKS = 39;
const WEEKS = PAST_WEEKS + FUTURE_WEEKS;
/** By default the board opens on the week two weeks before today. */
const LEAD_DAYS = 14;
/**
 * The timeline zoom levels, from closest to farthest. `week` is a week's width in px, `visible` the weeks on screen,
 * `step` the weeks one press of Earlier or Later moves, `labels` what the axis names.
 */
export const ZOOMS = {
  weeks: { week: 84, visible: 13, step: 4, labels: "week" },
  months: { week: 30, visible: 34, step: 13, labels: "month" },
  quarters: { week: 14, visible: 65, step: 26, labels: "month" },
} as const;
export type Zoom = keyof typeof ZOOMS;
export const ZOOM_ORDER: readonly Zoom[] = ["weeks", "months", "quarters"];

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
  /** False when a filter is on and this goal is shown only as the parent of one that matches. */
  match: boolean;
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
  /** `open` marks the week the board scrolls to when it loads. */
  weeks: { at: number; label: string }[];
  /** How many weeks the board draws, and where the week it opens on starts. */
  weekCount: number;
  openAt: number;
  /** The zoom in force and a week's width at it. */
  zoom: { level: Zoom; week: number };
  todayAt: number;
  /** The first and last day on screen when the board opens, and where Earlier and Later go. */
  window: { first: string; last: string; earlier: string; later: string };
  /** The filter in force. Empty when Home shows every goal. */
  filter: { health?: Exclude<Health, null>; q?: string };
  funded: PriorityRow[];
  backlog: PriorityRow[];
  summary: Summary;
};

function day(iso: string): number {
  return Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
}

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

const MONTH = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" });

/** "Oct", or "Jan 2027" when a new year starts. */
function monthLabel(t: number): string {
  const d = new Date(t);
  return d.getUTCMonth() === 0 ? `${MONTH.format(t)} ${d.getUTCFullYear()}` : MONTH.format(t);
}

/** The first day of each month that starts inside [start, end). */
function monthStarts(start: number, end: number): number[] {
  const d = new Date(start);
  const out: number[] = [];
  for (let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); t < end; t = Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth() + 1, 1)) out.push(t);
  return out;
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

/** What a viewer asked Home for. Each value that is not valid is ignored. */
export type HomeQuery = {
  /** Open the week that holds this day. */
  from?: string;
  /** Show only goals with this health. */
  health?: string;
  /** Show only goals whose summary holds this text. */
  q?: string;
  /** How close the timeline is: weeks, months, or quarters. */
  zoom?: string;
};

const HEALTHS = ["RED", "YELLOW", "GREEN"] as const;

export function prioritiesView(db: DatabaseSync, orgUnit: string, now: Date = new Date(), query: HomeQuery = {}): PrioritiesView {
  const from = query.from;
  const zoom: Zoom = (ZOOM_ORDER as readonly string[]).includes(query.zoom ?? "") ? (query.zoom as Zoom) : "weeks";
  const scale = ZOOMS[zoom];
  const health = (HEALTHS as readonly string[]).includes(query.health ?? "") ? (query.health as Exclude<Health, null>) : undefined;
  const q = query.q?.trim().slice(0, 100) || undefined;
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

  // The board opens on one week, two weeks before today unless `from` names another. It reaches 26 weeks back from there. Weeks start on Monday.
  const inView = (g: Row): Row[] => [g, ...(childrenOf.get(g.id as string) ?? []).flatMap(inView)];
  const monday = (t: number) => t - ((new Date(t).getUTCDay() + 6) % 7) * DAY;
  // A Committed date that passed in the last 10 weeks opens the board early enough to show it.
  const passed = tops
    .flat()
    .flatMap(inView)
    .filter((g) => g.state === "In Progress")
    .map((g) => committedDate(g, getGoal))
    .filter((c): c is NonNullable<typeof c> => c !== undefined)
    .map((c) => day(c.date) - 3 * DAY)
    .filter((t) => t >= today - 10 * 7 * DAY);
  const open = monday(isDate(from) ? day(from) : Math.min(today - LEAD_DAYS * DAY, ...passed));
  const start = open - PAST_WEEKS * 7 * DAY;
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

  const needle = q?.toLowerCase();
  const matches = (goal: Row) => (!health || goal.health === health) && (!needle || String(goal.summary).toLowerCase().includes(needle));
  /** With a filter on, keep a goal that matches, or that holds one that does. */
  const prune = (row: GoalRow): GoalRow | undefined => {
    const children = row.children.map(prune).filter((c): c is GoalRow => c !== undefined);
    return row.match || children.length ? { ...row, children } : undefined;
  };
  const filtering = Boolean(health || needle);

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
      match: matches(goal),
      children: (childrenOf.get(goal.id as string) ?? []).map((child) => goalRow(child, depth + 1, goal)),
    };
  };

  const rows: PriorityRow[] = priorities.map((p, i) => ({
    id: p.id as string,
    rank: p.rank as number,
    title: p.title as string,
    goals: tops[i].map((g) => goalRow(g, 0)).flatMap((g) => (filtering ? (prune(g) ?? []) : [g])),
  }));
  const cut = priorities.findIndex((p) => p.cut_line === true);
  const shownRows = (list: PriorityRow[]) => list.filter((p) => !filtering || p.goals.length > 0);
  const funded = shownRows(cut === -1 ? rows : rows.slice(0, cut + 1));
  const backlog = shownRows(cut === -1 ? [] : rows.slice(cut + 1));

  const fundedTops = (cut === -1 ? tops : tops.slice(0, cut + 1)).flat().map((g) => goalRow(g, 0));
  const top = fundedTops.filter((g) => g.state === "In Progress");
  const slips = top
    .filter((g) => g.lane.slip)
    .map((g) => ({ id: g.id, summary: g.summary, date: g.lane.tick?.label ?? "", days: g.lane.slip?.days ?? 0 }));
  const count = (h: Health) => top.filter((g) => g.health === h).length;
  // Until the Drafts slice, every stored Draft counts as open.
  const drafts = (db.prepare("SELECT COUNT(*) AS n FROM draft").get() as { n: number }).n;

  let nextPromotion: Summary["nextPromotion"];
  for (const goal of tops.flat().flatMap(inView)) {
    const milestone = typeof goal.promotion_milestone === "string" ? goals.get(goal.promotion_milestone) : undefined;
    if (!milestone || !isOpen(milestone)) continue;
    const date = currentDate(milestone);
    if (date === undefined || day(date) < today || (nextPromotion && day(date) >= day(nextPromotion.date))) continue;
    nextPromotion = { milestone: milestone.id as string, date, days: Math.round((day(date) - today) / DAY), goal: goal.id as string, summary: goal.summary as string };
  }

  // What is on screen when the board opens: from the opening week, or less far ahead when the board is not that long.
  const shownFrom = Math.max(start, Math.min(open, end - scale.visible * 7 * DAY));
  const weeks =
    scale.labels === "week"
      ? Array.from({ length: WEEKS }, (_, i) => start + i * 7 * DAY).map((t) => ({ at: pos(t), label: shortDate(iso(t), todayIso) }))
      : monthStarts(start, end).map((t) => ({ at: pos(t), label: monthLabel(t) }));
  return {
    org,
    today: todayIso,
    weeks,
    weekCount: WEEKS,
    openAt: pos(open),
    zoom: { level: zoom, week: scale.week },
    todayAt: pos(today),
    filter: { health, q },
    window: { first: iso(shownFrom), last: iso(shownFrom + scale.visible * 7 * DAY - DAY), earlier: iso(open - scale.step * 7 * DAY), later: iso(open + scale.step * 7 * DAY) },
    funded,
    backlog,
    summary: {
      committed: { counts: { RED: count("RED"), YELLOW: count("YELLOW"), GREEN: count("GREEN") }, healths: top.map((g) => g.health), slips },
      drafts,
      nextPromotion,
    },
  };
}
