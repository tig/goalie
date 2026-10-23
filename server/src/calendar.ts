import { DAY, day, flatten, iso, type GoalDate, type GoalRow, type PrioritiesView } from "./priorities.ts";
import { weekStart } from "./timeline.ts";

/**
 * The Priorities view laid out as a month calendar. Pure: it reads view data, not the store.
 * Each goal date sits on its day. home-calendar.ts draws it.
 */

export type CalendarMark = { goal: GoalRow; date: GoalDate };

export type Day = { date: string; inMonth: boolean; today: boolean; marks: CalendarMark[] };

export type CalendarMonth = {
  /** The first day of the month on screen. */
  month: string;
  /** The first day of the month before and the month after. */
  earlier: string;
  later: string;
  /** Monday first. Each week has 7 days. */
  weeks: Day[][];
};

/** The month that holds `from`, else today's month. With a filter on, only goals that match are drawn. */
export function calendarMonth(view: PrioritiesView, from?: string): CalendarMonth {
  const at = from ?? view.today;
  const year = Number(at.slice(0, 4));
  const month = Number(at.slice(5, 7)) - 1;
  const first = Date.UTC(year, month, 1);
  const next = Date.UTC(year, month + 1, 1);
  const filtering = Boolean(view.filter.health || view.filter.q);

  const marks = new Map<string, CalendarMark[]>();
  for (const goal of flatten([...view.funded, ...view.backlog].flatMap((p) => p.goals))) {
    if (filtering && !goal.match) continue;
    for (const date of goal.dates) marks.set(date.date, [...(marks.get(date.date) ?? []), { goal, date }]);
  }

  const weeks: Day[][] = [];
  for (let t = weekStart(first); t < next; t += 7 * DAY) {
    weeks.push(
      Array.from({ length: 7 }, (_, i) => {
        const date = iso(t + i * DAY);
        return { date, inMonth: day(date) >= first && day(date) < next, today: date === view.today, marks: marks.get(date) ?? [] };
      }),
    );
  }
  return { month: iso(first), earlier: iso(Date.UTC(year, month - 1, 1)), later: iso(next), weeks };
}
