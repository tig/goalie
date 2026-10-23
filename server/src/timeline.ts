import { DAY, day, flatten, iso, type GoalDate, type GoalRow, type PrioritiesView } from "./priorities.ts";

/**
 * The Priorities view laid out on a timeline. Pure: it reads view data, not the store.
 * Positions are percents across the window. home-timeline.ts draws them.
 */

/** The board draws this many weeks before and after the week it opens on, and scrolls sideways through them. */
const PAST_WEEKS = 26;
const FUTURE_WEEKS = 39;
const WEEKS = PAST_WEEKS + FUTURE_WEEKS;
/** By default the board opens on the week two weeks before today. */
const LEAD_DAYS = 14;
/** One press of Earlier or Later moves the window this many weeks. */
const STEP_WEEKS = 4;

/** The Monday that starts the week holding `t`. Weeks start on Monday in the timeline and the calendar. */
export const weekStart = (t: number) => t - ((new Date(t).getUTCDay() + 6) % 7) * DAY;

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

export type TimelineWindow = {
  start: number;
  end: number;
  /** `open` marks the week the board scrolls to when it loads. */
  weeks: { at: number; date: string; open: boolean }[];
  todayAt: number;
  /** The first and last day on screen when the board opens, and where Earlier and Later go. */
  first: string;
  last: string;
  earlier: string;
  later: string;
};

const isCommitted = (d: GoalDate) => d.kind === "Committed" || d.kind === "Promotion Milestone";

/** The window opens on one week, two weeks before today unless `from` names another, or earlier to show a Committed date that passed in the last 10 weeks. */
export function timelineWindow(view: PrioritiesView, from?: string): TimelineWindow {
  const today = day(view.today);
  const passed = flatten([...view.funded, ...view.backlog].flatMap((p) => p.goals))
    .filter((g) => g.state === "In Progress")
    .flatMap((g) => g.dates.filter(isCommitted))
    .map((d) => day(d.date) - 3 * DAY)
    .filter((t) => t >= today - 10 * 7 * DAY);
  const open = weekStart(from ? day(from) : Math.min(today - LEAD_DAYS * DAY, ...passed));
  const start = open - PAST_WEEKS * 7 * DAY;
  const end = start + WEEKS * 7 * DAY;
  const at = (t: number) => (100 * (Math.min(Math.max(t, start), end) - start)) / (end - start);
  return {
    start,
    end,
    weeks: Array.from({ length: WEEKS }, (_, i) => {
      const t = start + i * 7 * DAY;
      return { at: at(t), date: iso(t), open: t === open };
    }),
    todayAt: at(today),
    first: iso(open),
    last: iso(open + 13 * 7 * DAY - DAY),
    earlier: iso(open - STEP_WEEKS * 7 * DAY),
    later: iso(open + STEP_WEEKS * 7 * DAY),
  };
}

/** One goal's lane: health from its start to today, the time left to its committed date, a slip, and an uncommitted date. */
export function laneOf(goal: GoalRow, window: TimelineWindow, todayIso: string): Lane {
  const { start, end } = window;
  const today = day(todayIso);
  const pos = (t: number) => (100 * (Math.min(Math.max(t, start), end) - start)) / (end - start);
  const outside = (t: number): Mark["outside"] => (t < start ? "before" : t > end ? "after" : null);
  const result: Lane = {};
  const begun = day(goal.started);
  const committed = goal.dates.find(isCommitted);
  const c = committed ? day(committed.date) : undefined;
  if (goal.state === "In Progress" && goal.health) result.health = { from: pos(begun), to: pos(Math.min(today, c ?? today)) };
  if (committed && c !== undefined) {
    if (committed.slipDays !== undefined) result.slip = { from: pos(c), to: pos(today), days: committed.slipDays };
    else result.ahead = { from: pos(Math.max(today, begun)), to: pos(c) };
    result.tick = { at: pos(c), date: committed, outside: outside(c) };
  }
  const uncommitted = goal.dates.find((d) => !isCommitted(d));
  if (uncommitted && (uncommitted.kind === "Ambition" || uncommitted.kind === "Fantasy")) {
    const f = day(uncommitted.date);
    result.end = { at: pos(f), date: uncommitted, outside: outside(f) };
    result.line = { from: pos(c ?? today), to: result.end.at, kind: uncommitted.kind };
  }
  return result;
}
