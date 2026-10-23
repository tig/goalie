import type { DatabaseSync } from "node:sqlite";
import { committedDate, currentDate, isDate, isOpen, OPEN_STATES } from "./goal.ts";
import { read, readAll } from "./read.ts";
import type { Row } from "./rules.ts";

/**
 * The Priorities view (SPEC.md §8.2). Tig made it the default view on 2026-10-14.
 * This module reads the store and returns plain data: the selection, the tree, the filter, and the summary.
 * timeline.ts and calendar.ts lay it out. home.ts draws it.
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

export const DAY = 86_400_000;

export type Health = "GREEN" | "YELLOW" | "RED" | null;

/** One date on a goal, with its Date Type. A Committed or Promotion Milestone date that passed before the goal was met carries its slip. */
export type GoalDate = {
  date: string;
  kind: "Committed" | "Promotion Milestone" | "Ambition" | "Fantasy";
  slipDays?: number;
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
  /** When the goal started: its first move to In Progress, else its first Event. */
  started: string;
  /** The dates the row draws. Empty when a sub-goal has its parent's date and no slip. */
  dates: GoalDate[];
  ptg?: PtgStep;
  /** False when a filter is on and this goal is shown only as the parent of one that matches. */
  match: boolean;
  children: GoalRow[];
};

export type PriorityRow = { id: string; rank: number; title: string; goals: GoalRow[] };

export type Summary = {
  committed: { counts: { RED: number; YELLOW: number; GREEN: number }; healths: Health[]; slips: { id: string; summary: string; date: GoalDate }[] };
  drafts: number;
  nextPromotion?: { milestone: string; date: string; days: number; goal: string; summary: string };
};

export type PrioritiesView = {
  org: { id: string; name: string; level: string };
  today: string;
  /** The filter in force. Empty when Home shows every goal. */
  filter: { health?: Exclude<Health, null>; q?: string };
  funded: PriorityRow[];
  backlog: PriorityRow[];
  summary: Summary;
};

export function day(iso: string): number {
  return Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
}

export const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** A period is current when it names today's year ("2026") or quarter ("2026-Q4"). Calendar quarters are the default calendar (SPEC.md §12). */
export function isCurrentPeriod(period: string, todayIso: string): boolean {
  const year = todayIso.slice(0, 4);
  const quarter = Math.floor((Number(todayIso.slice(5, 7)) - 1) / 3) + 1;
  return period === year || period === `${year}-Q${quarter}`;
}

/** Every goal in the tree, parents before their children. */
export function flatten(goals: GoalRow[]): GoalRow[] {
  return goals.flatMap((g) => [g, ...flatten(g.children)]);
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

/** The drawings of the Priorities view. The drawing does not change the saved definition (SPEC.md §8.2). */
export const FORMATS = ["timeline", "list", "calendar"] as const;
export type Format = (typeof FORMATS)[number];

/** What a viewer asked Home for. A value that is not valid is dropped. */
export type HomeQuery = {
  format: Format;
  /** Open the week (timeline) or the month (calendar) that holds this day. */
  from?: string;
  /** Show only goals with this health. */
  health?: Exclude<Health, null>;
  /** Show only goals whose summary holds this text. */
  q?: string;
};

const HEALTHS = ["RED", "YELLOW", "GREEN"] as const;

/** The one reader of Home's query string. */
export function parseHomeQuery(raw: Record<string, string | undefined>): HomeQuery {
  const pick = <T extends string>(values: readonly T[], value: string | undefined) => (values as readonly string[]).includes(value ?? "") ? (value as T) : undefined;
  return {
    format: pick(FORMATS, raw.format) ?? "timeline",
    from: isDate(raw.from) ? raw.from : undefined,
    health: pick(HEALTHS, raw.health),
    q: raw.q?.trim().slice(0, 100) || undefined,
  };
}

export function prioritiesView(db: DatabaseSync, orgUnit: string, now: Date = new Date(), query: Partial<HomeQuery> = {}): PrioritiesView {
  const { health, q } = query;
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
  const inView = (g: Row): Row[] => [g, ...(childrenOf.get(g.id as string) ?? []).flatMap(inView)];

  /** The dates a row draws. A sub-goal draws its own only when they differ from its parent's. A slip is always drawn. */
  const datesOf = (goal: Row, drawDate: boolean): GoalDate[] => {
    const dates: GoalDate[] = [];
    const committed = committedDate(goal, getGoal);
    if (committed) {
      const c = day(committed.date);
      const slipDays = c < today ? Math.round((today - c) / DAY) : undefined;
      if (drawDate || slipDays !== undefined) dates.push({ ...committed, ...(slipDays !== undefined ? { slipDays } : {}) });
    }
    if (drawDate && (goal.date_type === "Ambition" || goal.date_type === "Fantasy")) dates.push({ date: goal.due_date as string, kind: goal.date_type });
    return dates;
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
    const health = (goal.health as Health) ?? null;
    return {
      id: goal.id as string,
      summary: goal.summary as string,
      owner: goal.owner as string,
      ownerName: names.get(goal.owner as string) ?? (goal.owner as string),
      state: goal.state as string,
      health,
      depth,
      started: started.get(goal.id as string) ?? todayIso,
      dates: datesOf(goal, !parent || ownDate(goal) !== ownDate(parent)),
      ...(health === "RED" || health === "YELLOW" ? { ptg: firstStep(goal.path_to_green, names) } : {}),
      match: matches(goal),
      children: (childrenOf.get(goal.id as string) ?? []).map((child) => goalRow(child, depth + 1, goal)),
    };
  };

  // Build every row once. The summary counts them all. The filter prunes what is drawn.
  const built = tops.map((list) => list.map((g) => goalRow(g, 0)));
  const rows: PriorityRow[] = priorities.map((p, i) => ({
    id: p.id as string,
    rank: p.rank as number,
    title: p.title as string,
    goals: built[i].flatMap((g) => (filtering ? (prune(g) ?? []) : [g])),
  }));
  const cut = priorities.findIndex((p) => p.cut_line === true);
  const shownRows = (list: PriorityRow[]) => list.filter((p) => !filtering || p.goals.length > 0);
  const funded = shownRows(cut === -1 ? rows : rows.slice(0, cut + 1));
  const backlog = shownRows(cut === -1 ? [] : rows.slice(cut + 1));

  const top = (cut === -1 ? built : built.slice(0, cut + 1)).flat().filter((g) => g.state === "In Progress");
  const slips = top.flatMap((g) => {
    const date = g.dates.find((d) => d.slipDays !== undefined);
    return date ? [{ id: g.id, summary: g.summary, date }] : [];
  });
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

  return {
    org,
    today: todayIso,
    filter: { health, q },
    funded,
    backlog,
    summary: {
      committed: { counts: { RED: count("RED"), YELLOW: count("YELLOW"), GREEN: count("GREEN") }, healths: top.map((g) => g.health), slips },
      drafts,
      nextPromotion,
    },
  };
}
