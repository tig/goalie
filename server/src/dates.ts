/**
 * Date math on ISO days (YYYY-MM-DD), the one home for the server and the app (review E1).
 * Every day is UTC midnight, so no time zone moves a date. The browser bundle imports this file, so it imports nothing.
 */

export const DAY = 86_400_000;

/** The time of an ISO day at UTC midnight. */
export const day = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);

export const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

export const addDays = (date: string, n: number) => iso(day(date) + n * DAY);

/** A real calendar date written YYYY-MM-DD, from 1970-01-01 to 9999-12-31 (review Q10). "2026-13-45" is not one. */
export function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1970-01-01") return false;
  const t = day(value);
  return !Number.isNaN(t) && iso(t) === value;
}

/** The day of the week, from 0 for Monday to 6 for Sunday. Weeks start on Monday in the timeline and the calendar. */
export const weekday = (date: string) => (new Date(day(date)).getUTCDay() + 6) % 7;

/** The Monday that starts the week holding `date`. */
export const weekStart = (date: string) => addDays(date, -weekday(date));

/** Whole days from `from` to `to`. */
export const daysBetween = (from: string, to: string) => Math.round((day(to) - day(from)) / DAY);

/** The calendar day at instant `t` in an IANA time zone, e.g. "America/Denver". */
export function dateIn(t: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(t);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

const MONTH_DAY = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
const MONTH_DAY_YEAR = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const MONTH = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" });
const MONTH_YEAR = new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" });

/** "Oct 1", or "Mar 31, 2027" outside the current year. */
export function shortDate(date: string, today: string): string {
  return (date.slice(0, 4) === today.slice(0, 4) ? MONTH_DAY : MONTH_DAY_YEAR).format(day(date));
}

/** "Oct", or "Jan 2027" when a new year starts. */
export function monthLabel(date: string): string {
  const t = day(date);
  return new Date(t).getUTCMonth() === 0 ? `${MONTH.format(t)} ${new Date(t).getUTCFullYear()}` : MONTH.format(t);
}

/** "October 2026". */
export const monthYear = (date: string) => MONTH_YEAR.format(day(date));
