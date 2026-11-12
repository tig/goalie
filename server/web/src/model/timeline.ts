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
const ZOOMS = {
  // Rule 21a: days, 28 px a day, a label each day (Chelsea, 2026-10-25).
  days: { week: 196, past: 6, future: 9, visible: 4, step: 1, labels: "day" },
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
  /** At days, the month names in the band above the day numbers (rule 21a); empty at every other zoom. */
  months: { at: number; date: string; label: string }[];
  /** A day's position across the board, held to its edges: the start of that day. The today line is at the middle of today (`todayAt`). */
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

/** Rule 21a: at days, every day is named by its number, and the month's short name sits in a band above, from the 1st and at the start. */
function dayLabels(start: string, days: number): { date: string; label: string }[] {
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(start, i);
    return { date, label: String(new Date(day(date)).getUTCDate()) };
  });
}

function monthBand(start: string, days: number): { date: string; label: string }[] {
  return dayLabels(start, days)
    .filter((d, i) => i === 0 || d.label === "1")
    .map((d) => ({ date: d.date, label: MONTH.format(day(d.date)) }));
}

/** The window opens on one week: two weeks before today unless `from` names another, or earlier to show a Committed date that passed in the last 10 weeks. */
export function timelineWindow(priorities: { goals: ApiGoal[] }[], today: string, zoom: Zoom, from?: string): TimelineWindow {
  const scale = ZOOMS[zoom];
  const passed = flatten(priorities.flatMap((p) => p.goals))
    .filter((g) => g.state === "In Progress")
    .flatMap((g) => g.dates.filter(isCommitted))
    .map((d) => addDays(d.date, -3))
    .filter((d) => daysBetween(d, today) <= 10 * 7);
  const weeks = scale.past + scale.future;
  // The board stays inside 1970 to 9999, so no label names a year past 9999 (review Q10).
  const first = weekStart(addDays("1970-01-01", scale.past * 7 + 6));
  const last = weekStart(addDays("9999-12-31", -scale.future * 7));
  const wanted = weekStart(from ?? [addDays(today, -LEAD_DAYS), ...passed].sort()[0]);
  const open = wanted < first ? first : wanted > last ? last : wanted;
  const start = addDays(open, -scale.past * 7);
  const end = addDays(start, weeks * 7);
  const span = day(end) - day(start);
  const pos = (date: string) => (100 * (Math.min(Math.max(day(date), day(start)), day(end)) - day(start))) / span;
  const labels =
    scale.labels === "day"
      ? dayLabels(start, weeks * 7).map((d) => ({ at: pos(d.date), label: d.label }))
      : scale.labels === "week"
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
    // Rule 20: the today line runs through the middle of today's day at every zoom, not on the boundary before it.
    todayAt: (pos(today) + pos(addDays(today, 1))) / 2,
    labels,
    months: scale.labels === "day" ? monthBand(start, weeks * 7).map((m) => ({ at: pos(m.date), ...m })) : [],
    pos,
  };
}

/**
 * The scroll position that opens the board on its week, held inside what the board can scroll.
 * When that would put today past the left third of the `width` px on screen, as on a narrow board, it opens with today at the left third.
 */
export function openScroll(openPx: number, todayPx: number, width: number, scrollWidth: number, clientWidth: number): number {
  const left = todayPx - openPx > width / 3 ? todayPx - width / 3 : openPx;
  return Math.max(0, Math.min(left, scrollWidth - clientWidth));
}

/** True when a label `widthPx` wide at `atPx` is whole on screen. An axis label that is not is hidden. */
export const fitsView = (atPx: number, widthPx: number, view: { left: number; right: number }) => atPx >= view.left && atPx + widthPx <= view.right;

/** Where the Today pill sits: over the today line, held inside the screen by half its width. Null when the line is off screen. */
export function todayPill(atPx: number, halfWidth: number, view: { left: number; right: number }): number | null {
  if (atPx < view.left || atPx > view.right) return null;
  return Math.max(view.left + halfWidth, Math.min(atPx, view.right - halfWidth));
}

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

/** An edge chip starts this far inside the edge, clear of the edge fade. */
export const EDGE_INSET = 30;

/** A chip's width in px: its text and 8 px of padding each side. */
export const chipWidth = (text: string) => labelWidth(text) + 16;

/** A date to put on a chip: where its mark is, in board px, its text, and which edge of the board it lies past, if any. */
export type ChipMark = { atPx: number; text: string; outside: "before" | "after" | null };

/** A chip on the bar's line. `left` is in board px. `arrow` points to a date off screen. `text` null is an arrow alone. */
export type Chip = { left: number; width: number; text: string | null; arrow: "before" | "after" | null };

type View = { left: number; right: number };

const edgeChip = (text: string | null, side: "before" | "after", view: View): Chip => {
  const width = chipWidth(text === null ? "→" : `${text} →`);
  return { left: side === "before" ? view.left + EDGE_INSET : view.right - EDGE_INSET - width, width, text, arrow: side };
};

const pastEdge = (m: ChipMark, view: View) => m.outside ?? (m.atPx < view.left ? "before" : m.atPx > view.right ? "after" : null);

/** A chip beside its mark: to its right, else to its left, else held inside the screen. */
function beside(m: ChipMark, view: View): Chip {
  const side = pastEdge(m, view);
  if (side) return edgeChip(m.text, side, view);
  const width = chipWidth(m.text);
  const right = m.atPx + LABEL_GAP;
  const left = m.atPx - LABEL_GAP - width;
  const at = right + width <= view.right ? right : left >= view.left ? left : Math.max(view.left, view.right - width);
  return { left: at, width, text: m.text, arrow: null };
}

const clear = (a: Chip, b: Chip) => a.left + a.width + LABEL_GAP <= b.left || b.left + b.width + LABEL_GAP <= a.left;

/** Where a chip `width` wide sits beside chip `a`: on the `prefer` side when it fits on screen, else the other side, else held inside the screen. */
function next(a: Chip, width: number, prefer: "before" | "after", view: View): number {
  const after = a.left + a.width + LABEL_GAP;
  const before = a.left - LABEL_GAP - width;
  const fitsAfter = after + width <= view.right;
  const fitsBefore = before >= view.left;
  if (prefer === "after" ? fitsAfter : !fitsBefore && fitsAfter) return after;
  if (fitsBefore) return before;
  return Math.min(Math.max(view.left, after), view.right - width);
}

/**
 * Rule 23: a lane's dates as chips on the bar's line, so no text floats above or below it.
 * `date` is the committed date's chip. With a slip it names the slip too, and sits just right of the today line, `todayPx`.
 * `end` is the Ambition or Fantasy date's chip. It gives way to the date chip: on the other side of its mark, else an arrow alone at its edge, else none.
 * `covered` is true when the end has no chip and the date chip lies over its dot, so the date chip must name the end date on hover too.
 */
export function placeChips(date: (ChipMark & { slip: boolean }) | undefined, end: ChipMark | undefined, todayPx: number, view: View): { date?: Chip; end?: Chip; covered?: boolean } {
  let first: Chip | undefined;
  if (date?.slip) {
    const width = chipWidth(date.text);
    if (todayPx < view.left) first = edgeChip(date.text, "before", view);
    else if (todayPx > view.right) first = edgeChip(date.text, "after", view);
    else first = { left: todayPx + LABEL_GAP + width <= view.right ? todayPx + LABEL_GAP : Math.max(view.left, todayPx - LABEL_GAP - width), width, text: date.text, arrow: null };
  } else if (date) first = beside(date, view);
  if (!end) return { date: first };
  let second: Chip | undefined = beside(end, view);
  if (first && !clear(first, second)) {
    const side = pastEdge(end, view);
    if (side) {
      second = edgeChip(null, side, view);
      // An arrow alone that would still meet the date chip sits beside it, on the side of its edge when there is room.
      if (!clear(first, second)) second = { ...second, left: next(first, second.width, side, view) };
    } else {
      const width = chipWidth(end.text);
      const other: Chip = { left: second.left > end.atPx ? end.atPx - LABEL_GAP - width : end.atPx + LABEL_GAP, width, text: end.text, arrow: null };
      second = other.left >= view.left && other.left + width <= view.right && clear(first, other) ? other : undefined;
      if (!second && end.atPx >= first.left && end.atPx <= first.left + first.width) return { date: first, covered: true };
    }
  }
  return { date: first, end: second };
}

type Mark = {
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
    if (over && committed) result.health = { from: pos(committed.date), to: window.todayAt };
    else result.health = { from: pos(goal.started), to: committed && committed.date < today ? pos(committed.date) : window.todayAt };
  }
  if (committed) {
    const c = committed.date;
    if (committed.slipDays !== undefined) result.slip = { from: pos(c), to: window.todayAt, days: committed.slipDays, over: over && result.health !== undefined };
    else result.ahead = { from: goal.started > today ? pos(goal.started) : window.todayAt, to: pos(c) };
    result.tick = { at: pos(c), date: committed, outside: outside(c) };
  }
  const uncommitted = goal.dates.find((d) => d.kind === "Ambition" || d.kind === "Fantasy");
  if (uncommitted && (uncommitted.kind === "Ambition" || uncommitted.kind === "Fantasy")) {
    result.end = { at: pos(uncommitted.date), date: uncommitted, outside: outside(uncommitted.date) };
    result.line = { from: committed ? pos(committed.date) : window.todayAt, to: result.end.at, kind: uncommitted.kind };
  }
  return result;
}
