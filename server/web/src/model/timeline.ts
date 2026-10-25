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

/** Rule 21a: at days, each day is named by its number; the 1st of a month and the first label also name the month: "Aug 17", "18", ..., "Sep 1". */
function dayLabels(start: string, days: number): { date: string; label: string }[] {
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(start, i);
    const t = day(date);
    const n = new Date(t).getUTCDate();
    return { date, label: i === 0 || n === 1 ? `${MONTH.format(t)} ${n}` : String(n) };
  }).map((d, i, all) => (i > 0 && /\D/.test(all[i - 1].label) ? { ...d, label: "" } : d));
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
    todayAt: pos(today),
    labels,
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

/** An edge label starts this far inside the edge, clear of the edge fade. */
export const EDGE_INSET = 30;

/** `band` is where the label sits: a tick's above the bar, an uncommitted date's below it. Labels in different bands cannot cover each other. */
export type LaneMark = { key: string; atPx: number; text: string; outside: "before" | "after" | null; band?: "above" | "below" };

/**
 * Where a lane's labels go, so no two overlap (rule 23). Each band places its labels on its own.
 * Every mark past an edge of the screen joins one label at that edge in its band, in date order. A mark whose own label could not clear that edge label, or fits on neither side of the mark, joins it too, or starts one at the nearer edge.
 * Each other mark labels to its right, else to its left.
 */
export function placeLaneLabels(marks: LaneMark[], view: { left: number; right: number }): Placed {
  const names = [...new Set(marks.map((m) => m.band ?? "above"))];
  const inBand = (band: string) => marks.filter((m) => (m.band ?? "above") === band);
  // Rule 23c: an edge list has no bands, so each band also keeps clear of the other bands' edge labels: a second pass reserves them.
  const first = names.map((band) => placeBand(inBand(band), view));
  const edge = (side: "before" | "after") => marks.filter((m) => first.some((b) => b[side].includes(m.key)));
  // The list starts at the top of the row: its first line meets the labels above the bar, and a second line reaches the labels below it.
  const others = (side: "before" | "after", band: string) => {
    const list = edge(side);
    return band === "below" && list.length < 2 ? [] : list.filter((m) => (m.band ?? "above") !== band);
  };
  const bands = names.map((band) => placeBand(inBand(band), view, { before: others("before", band), after: others("after", band) }));
  const order = (keys: string[]) => [...marks].sort((a, b) => a.atPx - b.atPx).map((m) => m.key).filter((k) => keys.includes(k));
  return {
    before: order(bands.flatMap((b) => b.before)),
    after: order(bands.flatMap((b) => b.after)),
    inside: bands.flatMap((b) => b.inside).sort((a, b) => order([a.key, b.key])[0] === a.key ? -1 : 1),
  };
}

type Placed = { before: string[]; after: string[]; inside: { key: string; side: "left" | "right" }[] };

/** placeLaneLabels for the labels of one band. */
function placeBand(marks: LaneMark[], view: { left: number; right: number }, others: { before: LaneMark[]; after: LaneMark[] } = { before: [], after: [] }): Placed {
  const sorted = [...marks].sort((a, b) => a.atPx - b.atPx);
  const before = new Set(sorted.filter((m) => m.outside === "before" || (!m.outside && m.atPx < view.left)).map((m) => m.key));
  const after = new Set(sorted.filter((m) => m.outside === "after" || (!m.outside && m.atPx > view.right)).map((m) => m.key));
  // An edge list is as wide as its longest line (rule 23c).
  const reserve = (keys: Set<string>, side: "before" | "after") => {
    const texts = [...sorted.filter((m) => keys.has(m.key)), ...others[side]].map((m) => labelWidth(m.text));
    return texts.length ? EDGE_INSET + Math.max(...texts) + LABEL_GAP : 0;
  };
  let inner = view;
  for (let changed = true; changed; ) {
    changed = false;
    inner = { left: view.left + reserve(before, "before"), right: view.right - reserve(after, "after") };
    for (const m of sorted) {
      if (before.has(m.key) || after.has(m.key)) continue;
      // A label that fits on neither side of its mark joins the nearer edge label, so it is whole and covers nothing.
      // With no edge label yet, it starts one at the nearer edge (QA R15: a lone slip label was cut at the right).
      const w = labelWidth(m.text);
      const fits = m.atPx + LABEL_GAP + w <= inner.right || m.atPx - LABEL_GAP - w >= inner.left;
      const nearer = after.size && !before.size ? after : before.size && !after.size ? before : inner.right - m.atPx < m.atPx - inner.left ? after : before;
      const side = m.atPx < inner.left ? before : m.atPx > inner.right ? after : fits ? undefined : nearer;
      if (side) {
        side.add(m.key);
        changed = true;
      }
    }
  }
  const keys = (set: Set<string>) => sorted.filter((m) => set.has(m.key)).map((m) => m.key);
  const inside = sorted.filter((m) => !before.has(m.key) && !after.has(m.key)).map((m) => ({ key: m.key, side: placeLabel(m.atPx, labelWidth(m.text), inner) as "left" | "right" }));
  return { before: keys(before), after: keys(after), inside };
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
