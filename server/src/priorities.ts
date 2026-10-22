import type { DatabaseSync } from "node:sqlite";
import type { Row } from "./rules.ts";
import { read } from "./write.ts";

/**
 * The Priorities view (SPEC.md §8.2), drawn as a timeline. Tig made it the default view on 2026-10-14.
 * This module reads the store and returns plain data. home.ts draws it.
 */

/** The saved definition behind the screen. A stored view table is a later issue (#8, Epic 7). */
export const PRIORITIES_VIEW = {
  name: "Priorities",
  select: { level: "Company", state: ["Backlog", "In Progress"] },
  sort: "rank",
  columns: ["Summary", "Owner", "Health", "Date Type", "Promotion Milestone", "PTG"],
} as const;

const DAY = 86_400_000;
const WEEKS = 13;

export type Health = "GREEN" | "YELLOW" | "RED" | null;

export type Mark = { at: number; label: string; kind: "Committed" | "Promotion Milestone" | "Ambition" | "Fantasy"; outside: boolean };

export type Lane = {
  /** Percent positions across the window. */
  health?: { from: number; to: number };
  ahead?: { from: number; to: number };
  slip?: { from: number; to: number; days: number };
  tick?: Mark;
  line?: { from: number; to: number; kind: "Ambition" | "Fantasy" };
  end?: Mark;
};

export type GoalRow = {
  id: string;
  summary: string;
  owner: string;
  ownerName: string;
  state: string;
  health: Health;
  depth: number;
  /** The row's dates as text, for a screen too narrow for the lane. */
  when: string;
  lane: Lane;
  children: GoalRow[];
};

export type PriorityRow = { id: string; rank: number; title: string; goals: GoalRow[] };

export type Summary = {
  committed: { green: number; total: number; healths: Health[]; slips: { id: string; summary: string; date: string; days: number }[] };
  drafts: number;
  nextPromotion?: { milestone: string; date: string; days: number; goal: string; summary: string };
};

export type PrioritiesView = {
  org: string;
  today: string;
  weeks: { at: number; label: string }[];
  todayAt: number;
  funded: PriorityRow[];
  backlog: PriorityRow[];
  summary: Summary;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function day(iso: string): number {
  return Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
}

/** "Oct 1", or "Mar 31, 2027" outside the current year. */
export function shortDate(iso: string, todayIso: string): string {
  const d = new Date(day(iso));
  const label = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  return iso.slice(0, 4) === todayIso.slice(0, 4) ? label : `${label}, ${d.getUTCFullYear()}`;
}

function all(db: DatabaseSync, sql: string, ...params: string[]): Row[] {
  return db.prepare(sql).all(...params) as Row[];
}

/** When a goal started: its move to In Progress, else its first Event. */
function started(db: DatabaseSync, id: string): string | undefined {
  const moved = db
    .prepare("SELECT timestamp FROM event WHERE entity_kind = 'goal' AND entity = ? AND field = 'state' AND new = '\"In Progress\"' ORDER BY sequence LIMIT 1")
    .get(id) as Row | undefined;
  const first = db.prepare("SELECT timestamp FROM event WHERE entity_kind = 'goal' AND entity = ? ORDER BY sequence LIMIT 1").get(id) as Row | undefined;
  return (moved?.timestamp ?? first?.timestamp) as string | undefined;
}

/** The date health is judged against (SPEC.md §6.1): its own Committed date, else its Promotion Milestone's. */
function committedDate(db: DatabaseSync, goal: Row): { date: string; kind: "Committed" | "Promotion Milestone" } | undefined {
  if (goal.date_type === "Committed") return { date: (goal.changed_due_date ?? goal.due_date) as string, kind: "Committed" };
  const milestone = typeof goal.promotion_milestone === "string" ? read(db, "goal", goal.promotion_milestone) : undefined;
  if (!milestone) return undefined;
  return { date: (milestone.changed_due_date ?? milestone.due_date) as string, kind: "Promotion Milestone" };
}

export function prioritiesView(db: DatabaseSync, orgUnit: string, now: Date = new Date()): PrioritiesView {
  const todayIso = now.toISOString().slice(0, 10);
  const today = day(todayIso);
  // Start two weeks back, or earlier to show a Committed date that has passed. Weeks start on Monday.
  const passed = all(db, "SELECT * FROM goal WHERE state = 'In Progress'")
    .map((g) => committedDate(db, g))
    .filter((c): c is NonNullable<typeof c> => c !== undefined)
    .map((c) => day(c.date) - 3 * DAY);
  const from = Math.min(today - 14 * DAY, ...passed);
  const start = from - ((new Date(from).getUTCDay() + 6) % 7) * DAY;
  const end = start + WEEKS * 7 * DAY;
  const pos = (t: number) => (100 * (Math.min(Math.max(t, start), end) - start)) / (end - start);
  const outside = (t: number) => t < start || t > end;

  const lane = (goal: Row): Lane => {
    const result: Lane = {};
    const open = goal.state === "In Progress" || goal.state === "Backlog";
    const from = day(started(db, goal.id as string) ?? todayIso);
    const committed = committedDate(db, goal);
    const c = committed ? day(committed.date) : undefined;
    if (goal.state === "In Progress" && goal.health) result.health = { from: pos(from), to: pos(Math.min(today, c ?? today)) };
    if (c !== undefined && committed) {
      if (open && c < today) result.slip = { from: pos(c), to: pos(today), days: Math.round((today - c) / DAY) };
      else if (c > today) result.ahead = { from: pos(Math.max(today, from)), to: pos(c) };
      const label = `${committed.kind} ${shortDate(committed.date, todayIso)}`;
      result.tick = { at: pos(c), label, kind: committed.kind, outside: outside(c) };
    }
    if (goal.date_type === "Ambition" || goal.date_type === "Fantasy") {
      const kind = goal.date_type;
      const f = day(goal.due_date as string);
      const mark: Mark = { at: pos(f), label: `${kind} ${shortDate(goal.due_date as string, todayIso)}`, kind, outside: outside(f) };
      result.line = { from: pos(c ?? today), to: mark.at, kind };
      result.end = mark;
    }
    return result;
  };

  const names = new Map(all(db, "SELECT id, display_name FROM actor").map((a) => [a.id as string, a.display_name as string]));
  const goalRow = (goal: Row, depth: number): GoalRow => ({
    id: goal.id as string,
    summary: goal.summary as string,
    owner: goal.owner as string,
    ownerName: names.get(goal.owner as string) ?? (goal.owner as string),
    state: goal.state as string,
    health: (goal.health as Health) ?? null,
    depth,
    ...((l) => ({ lane: l, when: [l.tick?.label, l.end?.label].filter(Boolean).join(" · ") }))(lane(goal)),
    children: all(db, "SELECT id FROM goal WHERE parent = ? AND state != 'Deleted' ORDER BY id", goal.id as string)
      .map((child) => goalRow(read(db, "goal", child.id as string) as Row, depth + 1)),
  });

  const priorities = all(db, "SELECT * FROM priority WHERE org_unit = ? AND status = 'Current' ORDER BY rank", orgUnit);
  const cut = priorities.findIndex((p) => p.cut_line != null && p.cut_line !== "" && p.cut_line !== "false");
  const rows: PriorityRow[] = priorities.map((p) => ({
    id: p.id as string,
    rank: p.rank as number,
    title: p.title as string,
    goals: all(db, "SELECT id FROM goal WHERE priority = ? AND state != 'Deleted' ORDER BY id", p.id as string)
      .map((g) => read(db, "goal", g.id as string) as Row)
      .filter((g) => g.parent == null || read(db, "goal", g.parent as string)?.priority !== p.id)
      .map((g) => goalRow(g, 0)),
  }));
  const funded = cut === -1 ? rows : rows.slice(0, cut + 1);
  const backlog = cut === -1 ? [] : rows.slice(cut + 1);

  const top = funded.flatMap((p) => p.goals).filter((g) => g.state === "In Progress");
  const slips = top
    .filter((g) => g.lane.slip)
    .map((g) => ({ id: g.id, summary: g.summary, date: g.lane.tick?.label ?? "", days: g.lane.slip?.days ?? 0 }));
  const decided = new Set(all(db, "SELECT DISTINCT entity FROM event WHERE entity_kind = 'draft' AND field IN ('approved', 'rejected')").map((e) => e.entity));
  const drafts = all(db, "SELECT id FROM draft").filter((d) => !decided.has(d.id)).length;

  let nextPromotion: Summary["nextPromotion"];
  for (const goal of all(db, "SELECT * FROM goal WHERE promotion_milestone IS NOT NULL AND state IN ('Backlog', 'In Progress')")) {
    const milestone = read(db, "goal", goal.promotion_milestone as string);
    if (!milestone || !["Backlog", "In Progress"].includes(milestone.state as string)) continue;
    const date = (milestone.changed_due_date ?? milestone.due_date) as string;
    if (day(date) < today || (nextPromotion && day(date) >= day(nextPromotion.date))) continue;
    nextPromotion = { milestone: milestone.id as string, date, days: Math.round((day(date) - today) / DAY), goal: goal.id as string, summary: goal.summary as string };
  }

  const weeks = Array.from({ length: WEEKS }, (_, i) => {
    const t = start + i * 7 * DAY;
    return { at: pos(t), label: shortDate(new Date(t).toISOString().slice(0, 10), todayIso) };
  });
  const org = read(db, "org_unit", orgUnit);
  return {
    org: (org?.name as string) ?? orgUnit,
    today: todayIso,
    weeks,
    todayAt: pos(today),
    funded,
    backlog,
    summary: { committed: { green: top.filter((g) => g.health === "GREEN").length, total: top.length, healths: top.map((g) => g.health), slips }, drafts, nextPromotion },
  };
}
