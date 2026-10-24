import type { GoalDate } from "../../../src/api.ts";
import { day, monthYear, shortDate } from "../../../src/dates.ts";

/** The app's words for dates: a date with its Date Type, a slip, and the date pill. The date math is server/src/dates.ts. */

const MONTH_DAY = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });

/** A goal date as text, with its Date Type: "Committed Oct 1". */
export const dateLabel = (date: GoalDate, today: string) => `${date.kind} ${shortDate(date.date, today)}`;

/** "slip 22 days". The one place a slip is written. */
export const slipLabel = (days: number) => `slip ${days} ${days === 1 ? "day" : "days"}`;

/** A committed date: the goal's own Committed date or its Promotion Milestone's. Health is judged against it. */
export const isCommitted = (date: GoalDate) => date.kind === "Committed" || date.kind === "Promotion Milestone";

/**
 * A goal's dates in the List's order: its own dates, then its Promotion Milestone's.
 * `judged` is the date health is judged on: its Committed date, else its Promotion Milestone's. It is written dark, the others light.
 */
export function listDates(dates: GoalDate[]): { own: GoalDate[]; pm: GoalDate[]; judged?: GoalDate } {
  return { own: dates.filter((d) => d.kind !== "Promotion Milestone"), pm: dates.filter((d) => d.kind === "Promotion Milestone"), judged: dates.find(isCommitted) };
}

/**
 * "Sep 28 – Dec 4". A year is named only outside the current one. When the two ends are in different years, both name it.
 * When both ends share a year that is not the current one, it is named once, at the end.
 */
export function rangeLabel(first: string, last: string, today: string): string {
  const a = first.slice(0, 4);
  const b = last.slice(0, 4);
  const thisYear = today.slice(0, 4);
  if (a !== b) return `${MONTH_DAY.format(day(first))}, ${a} – ${MONTH_DAY.format(day(last))}, ${b}`;
  if (a !== thisYear) return `${MONTH_DAY.format(day(first))} – ${shortDate(last, today)}`;
  return `${shortDate(first, today)} – ${shortDate(last, today)}`;
}

/** The longest form of the timeline range and of the calendar month, for each month. Laid over one another, they set the pill's width. */
export function labelSizers(today: string): string[] {
  const next = Number(today.slice(0, 4)) + 1;
  const months = Array.from({ length: 12 }, (_, m) => `${String(m + 1).padStart(2, "0")}`);
  return [
    ...months.map((m) => rangeLabel(`${next}-${m}-28`, `${next + 1}-${m}-28`, today)),
    ...months.map((m) => monthYear(`${next + 1}-${m}-01`)),
  ];
}
