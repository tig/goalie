import { day, monthYear, shortDate } from "./dates.ts";

/** The date pill's labels, and the longest forms it can take, so the pill keeps one width and no control beside it moves. */

const MONTH_DAY = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });

/** "Sep 28 – Dec 4". A year is named only outside the current one, and once when both ends share it. */
export function rangeLabel(first: string, last: string, today: string): string {
  const year = first.slice(0, 4);
  if (year === last.slice(0, 4) && year !== today.slice(0, 4)) return `${MONTH_DAY.format(day(first))} – ${shortDate(last, today)}`;
  return `${shortDate(first, today)} – ${shortDate(last, today)}`;
}

/** The longest form of the timeline range and of the calendar month, for each month. Laid over one another, they set the pill's width. */
export function labelSizers(today: string): string[] {
  const next = Number(today.slice(0, 4)) + 1;
  const months = Array.from({ length: 12 }, (_, m) => `${String(m + 1).padStart(2, "0")}`);
  return [
    ...months.map((m) => `${shortDate(`${next}-${m}-28`, today)} – ${shortDate(`${next + 1}-${m}-28`, today)}`),
    ...months.map((m) => monthYear(`${next + 1}-${m}-01`)),
  ];
}
