import type { ApiGoal, GoalDate } from "../../../src/api.ts";
import { addDays, day, daysBetween, iso, shortDate, weekStart } from "../../../src/dates.ts";
import { flatten } from "./filter.ts";
import { isCommitted } from "./labels.ts";
import type { Zoom } from "./query.ts";

/** The Priorities view laid out on a timeline. Positions are percents across the whole board. */

/** By default the board opens on the week two weeks before today. */
const LEAD_DAYS = 14;

/**
 * The zoom levels, from closest to farthest. `week` is a week's width in px, `past` and `future` the weeks the board draws before and after the week it opens on,
 * so it is wider than the screen at every zoom (review Q2). `visible` is the weeks the date pill names before the board is measured,
 * `step` the weeks one press of Earlier or Later moves, `labels` what the axis names.
 */
export const ZOOMS = {
  weeks: { week: 84, past: 26, future: 39, visible: 13, step: 4, labels: "week" },
  months: { week: 30, past: 52, future: 78, visible: 34, step: 13, labels: "month" },
  quarters: { week: 14, past: 104, future: 156, visible: 65, step: 26, labels: "other month" },
} as const;

export type TimelineWindow = {
  zoom: Zoom;
  /** The first day drawn, the day after the last, and the Monday the board opens on. */
  start: string;
  end: string;
  open: string;
  weeks: number;
  weekPx: number;
  /** How far the board scrolls to show the opening week first. */
  openPx: number;
  /** The days on screen when the board opens, before it is measured. */
  first: string;
  last: string;
  /** Where Earlier and Later go. */
  earlier: string;
  later: string;
  todayAt: number;
  labels: { at: number; label: string }[];
  /** A day's position across the board, held to its edges. */
  pos: (date: string) => number;
};

const MONTH = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" });

/**
 * The first day of each month that starts inside [start, end), named "Oct".
 * The first name carries its year outside the current one, and the first name in each new year carries it: "Jan 2027", or "Feb 2027" when January is skipped.
 */
function monthLabels(start: string, end: string, today: string, every: number): { date: string; label: string }[] {
  const out: { date: string; label: string }[] = [];
  const d = new Date(day(start));
  let year = Number(today.slice(0, 4));
  for (let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); t < day(end); t = Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth() + 1, 1)) {
    const at = new Date(t);
    if (at.getUTCMonth() % every !== every - 1) continue;
    const named = at.getUTCFullYear() !== year || (out.length === 0 && at.getUTCFullYear() !== Number(today.slice(0, 4)));
    year = at.getUTCFullYear();
    out.push({ date: iso(t), label: named ? `${MONTH.format(t)} ${year}` : MONTH.format(t) });
  }
  return out;
}

/** The window opens on one week: two weeks before today unless `from` names another, or earlier to show a Committed date that passed in the last 10 weeks. */
export function timelineWindow(priorities: { goals: ApiGoal[] }[], today: string, zoom: Zoom, from?: string): TimelineWindow {
  const scale = ZOOMS[zoom];
  const passed = flatten(priorities.flatMap((p) => p.goals))
    .filter((g) => g.state === "In Progress")
    .flatMap((g) => g.dates.filter(isCommitted))
    .map((d) => addDays(d.date, -3))
    .filter((d) => daysBetween(d, today) <= 10 * 7);
  const open = weekStart(from ?? [addDays(today, -LEAD_DAYS), ...passed].sort()[0]);
  const weeks = scale.past + scale.future;
  const start = addDays(open, -scale.past * 7);
  const end = addDays(start, weeks * 7);
  const span = day(end) - day(start);
  const pos = (date: string) => (100 * (Math.min(Math.max(day(date), day(start)), day(end)) - day(start))) / span;
  const labels =
    scale.labels === "week"
      ? Array.from({ length: weeks }, (_, i) => addDays(start, i * 7)).map((d) => ({ at: pos(d), label: shortDate(d, today) }))
      : monthLabels(start, end, today, scale.labels === "month" ? 1 : 2).map((m) => ({ at: pos(m.date), label: m.label }));
  return {
    zoom,
    start,
    end,
    open,
    weeks,
    weekPx: scale.week,
    openPx: scale.past * scale.week,
    first: open,
    last: addDays(open, scale.visible * 7 - 1),
    earlier: addDays(open, -scale.step * 7),
    later: addDays(open, scale.step * 7),
    todayAt: pos(today),
    labels,
    pos,
  };
}

/** The scroll position that opens the board on its week, held inside what the board can scroll. */
export const openScroll = (openPx: number, scrollWidth: number, clientWidth: number) => Math.max(0, Math.min(openPx, scrollWidth - clientWidth));

/** The days in view when the board is scrolled `scrollLeft` px and shows `width` px of timeline. A day cut by an edge counts. */
export function visibleRange(window: TimelineWindow, scrollLeft: number, width: number): { first: string; last: string } {
  const dayPx = window.weekPx / 7;
  const first = Math.floor(scrollLeft / dayPx + 1e-6);
  const last = Math.max(first, Math.ceil((scrollLeft + width) / dayPx - 1e-6) - 1);
  return { first: addDays(window.start, first), last: addDays(window.start, last) };
}

/** Where Earlier (-1) or Later (1) opens the board: one zoom step from the week that holds `first`, the first day on screen. */
export const moveFrom = (first: string, zoom: Zoom, direction: -1 | 1) => addDays(weekStart(first), direction * ZOOMS[zoom].step * 7);

/** The space between a mark and its label, in px. */
const LABEL_GAP = 6;
/** A label's width in px, estimated at 7 px a character of 11 px bold text. */
export const labelWidth = (text: string) => text.length * 7;

/**
 * Where a mark's label goes so it is whole on screen (rule 23, review X1). `view` is the board's px on screen.
 * A mark off screen is written at that edge with an arrow. A mark on screen labels to its right, else to its left.
 */
export function placeLabel(atPx: number, widthPx: number, view: { left: number; right: number }): "right" | "left" | "before" | "after" {
  if (atPx < view.left) return "before";
  if (atPx > view.right) return "after";
  if (atPx + LABEL_GAP + widthPx <= view.right) return "right";
  if (atPx - LABEL_GAP - widthPx >= view.left) return "left";
  return "right";
}

export type Mark = {
  at: number;
  date: GoalDate;
  /** Which edge of the board the date lies past, if any. */
  outside: "before" | "after" | null;
};

export type Lane = {
  health?: { from: number; to: number };
  ahead?: { from: number; to: number };
  /** `over` is true when the health bar runs under the slip: the goal started after its date passed. */
  slip?: { from: number; to: number; days: number; over: boolean };
  tick?: Mark;
  line?: { from: number; to: number; kind: "Ambition" | "Fantasy" };
  end?: Mark;
};

/**
 * One goal's lane: health from its start to today, the time left to its committed date, a slip, and an uncommitted date.
 * With a slip, health runs from the start to the committed date. A goal that started after its date passed draws its health under the slip (review Q6).
 */
export function laneOf(goal: Omit<ApiGoal, "children">, window: TimelineWindow, today: string): Lane {
  const { pos } = window;
  const outside = (date: string): Mark["outside"] => (date < window.start ? "before" : date > window.end ? "after" : null);
  const result: Lane = {};
  const committed = goal.dates.find(isCommitted);
  const slipped = committed?.slipDays !== undefined;
  const over = slipped && committed !== undefined && goal.started >= committed.date;
  if (goal.state === "In Progress" && goal.health) {
    if (over && committed) result.health = { from: pos(committed.date), to: pos(today) };
    else result.health = { from: pos(goal.started), to: pos(committed && committed.date < today ? committed.date : today) };
  }
  if (committed) {
    const c = committed.date;
    if (committed.slipDays !== undefined) result.slip = { from: pos(c), to: pos(today), days: committed.slipDays, over: over && result.health !== undefined };
    else result.ahead = { from: pos(goal.started > today ? goal.started : today), to: pos(c) };
    result.tick = { at: pos(c), date: committed, outside: outside(c) };
  }
  const uncommitted = goal.dates.find((d) => d.kind === "Ambition" || d.kind === "Fantasy");
  if (uncommitted && (uncommitted.kind === "Ambition" || uncommitted.kind === "Fantasy")) {
    result.end = { at: pos(uncommitted.date), date: uncommitted, outside: outside(uncommitted.date) };
    result.line = { from: committed ? pos(committed.date) : pos(today), to: result.end.at, kind: uncommitted.kind };
  }
  return result;
}
