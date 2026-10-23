import type { GoalDate } from "../../../src/api.ts";
import { DAY, day, iso, weekStart } from "./dates.ts";
import { flatten, type GoalRow } from "./filter.ts";

/** The Priorities view laid out as a month calendar. Each goal date sits on its day. Monday first. */

export type CalendarMark = { goal: GoalRow; date: GoalDate };

export type CalendarDay = { date: string; inMonth: boolean; today: boolean; marks: CalendarMark[] };

export type CalendarMonth = {
  /** The first day of the month on screen. */
  month: string;
  /** The first day of the month before and the month after. */
  earlier: string;
  later: string;
  /** Each week has 7 days, Monday first. */
  weeks: CalendarDay[][];
};

/** The month that holds `from`, else today's month. Only goals that match the filter are drawn; a parent kept for context is not. */
export function calendarMonth(priorities: { goals: GoalRow[] }[], today: string, from?: string): CalendarMonth {
  const at = from ?? today;
  const year = Number(at.slice(0, 4));
  const month = Number(at.slice(5, 7)) - 1;
  const first = Date.UTC(year, month, 1);
  const next = Date.UTC(year, month + 1, 1);

  const marks = new Map<string, CalendarMark[]>();
  for (const goal of flatten(priorities.flatMap((p) => p.goals))) {
    if (!goal.match) continue;
    for (const date of goal.dates) marks.set(date.date, [...(marks.get(date.date) ?? []), { goal, date }]);
  }

  const weeks: CalendarDay[][] = [];
  for (let t = day(weekStart(iso(first))); t < next; t += 7 * DAY) {
    weeks.push(
      Array.from({ length: 7 }, (_, i) => {
        const date = iso(t + i * DAY);
        return { date, inMonth: day(date) >= first && day(date) < next, today: date === today, marks: marks.get(date) ?? [] };
      }),
    );
  }
  return { month: iso(first), earlier: iso(Date.UTC(year, month - 1, 1)), later: iso(next), weeks };
}

/** A day shows this many chips. The rest open from "+N". */
export const SHOWN = 3;

export const dayChips = <T>(marks: T[]) => ({ shown: marks.slice(0, SHOWN), more: marks.slice(SHOWN) });
