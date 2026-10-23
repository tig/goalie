import type { ApiGoal, GoalDate } from "../../../src/api.ts";
import { addDays, daysBetween, day, isCommitted, iso, monthLabel, shortDate, weekStart } from "./dates.ts";
import { flatten } from "./filter.ts";
import type { Zoom } from "./query.ts";

/** The Priorities view laid out on a timeline. Positions are percents across the whole board. */

/** The board draws this many weeks before and after the week it opens on, and scrolls sideways through them. */
const PAST_WEEKS = 26;
const FUTURE_WEEKS = 39;
const WEEKS = PAST_WEEKS + FUTURE_WEEKS;
/** By default the board opens on the week two weeks before today. */
const LEAD_DAYS = 14;

/**
 * The zoom levels, from closest to farthest. `week` is a week's width in px, `visible` the weeks the date pill names before the board is measured,
 * `step` the weeks one press of Earlier or Later moves, `labels` what the axis names.
 */
export const ZOOMS = {
  weeks: { week: 84, visible: 13, step: 4, labels: "week" },
  months: { week: 30, visible: 34, step: 13, labels: "month" },
  quarters: { week: 14, visible: 65, step: 26, labels: "month" },
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

/** The first day of each month that starts inside [start, end). */
function monthStarts(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(day(start));
  for (let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); t < day(end); t = Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth() + 1, 1)) out.push(iso(t));
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
  const start = addDays(open, -PAST_WEEKS * 7);
  const end = addDays(start, WEEKS * 7);
  const span = day(end) - day(start);
  const pos = (date: string) => (100 * (Math.min(Math.max(day(date), day(start)), day(end)) - day(start))) / span;
  const labels =
    scale.labels === "week"
      ? Array.from({ length: WEEKS }, (_, i) => addDays(start, i * 7)).map((d) => ({ at: pos(d), label: shortDate(d, today) }))
      : monthStarts(start, end).map((d) => ({ at: pos(d), label: monthLabel(d) }));
  return {
    zoom,
    start,
    end,
    open,
    weeks: WEEKS,
    weekPx: scale.week,
    openPx: PAST_WEEKS * scale.week,
    first: open,
    last: addDays(open, scale.visible * 7 - 1),
    earlier: addDays(open, -scale.step * 7),
    later: addDays(open, scale.step * 7),
    todayAt: pos(today),
    labels,
    pos,
  };
}

/** The days in view when the board is scrolled `scrollLeft` px and shows `width` px of timeline. */
export function visibleRange(window: TimelineWindow, scrollLeft: number, width: number): { first: string; last: string } {
  const dayPx = window.weekPx / 7;
  const first = addDays(window.start, Math.round(scrollLeft / dayPx));
  return { first, last: addDays(first, Math.max(1, Math.round(width / dayPx)) - 1) };
}

export type Mark = {
  at: number;
  date: GoalDate;
  /** Which edge of the window the date lies past, if any. */
  outside: "before" | "after" | null;
};

export type Lane = {
  health?: { from: number; to: number };
  ahead?: { from: number; to: number };
  slip?: { from: number; to: number; days: number };
  tick?: Mark;
  line?: { from: number; to: number; kind: "Ambition" | "Fantasy" };
  end?: Mark;
};

/** One goal's lane: health from its start to today, the time left to its committed date, a slip, and an uncommitted date. */
export function laneOf(goal: Omit<ApiGoal, "children">, window: TimelineWindow, today: string): Lane {
  const { pos } = window;
  const outside = (date: string): Mark["outside"] => (date < window.start ? "before" : date > window.end ? "after" : null);
  const result: Lane = {};
  const committed = goal.dates.find(isCommitted);
  if (goal.state === "In Progress" && goal.health) {
    const to = committed && committed.date < today ? committed.date : today;
    result.health = { from: pos(goal.started), to: pos(to) };
  }
  if (committed) {
    const c = committed.date;
    if (committed.slipDays !== undefined) result.slip = { from: pos(c), to: pos(today), days: committed.slipDays };
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


/** Where Earlier (-1) or Later (1) opens the board: one zoom step from the week that holds `first`, the first day on screen. */
export const moveFrom = (first: string, zoom: Zoom, direction: -1 | 1) => addDays(weekStart(first), direction * ZOOMS[zoom].step * 7);
