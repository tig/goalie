import type { CalendarMark, CalendarMonth, Day } from "./calendar.ts";
import { dateLabel, escape, healthDot, shortDate } from "./components.ts";
import type { PrioritiesView } from "./priorities.ts";

/** The Priorities view drawn as a month calendar: each goal date sits on its day as a chip. Monday first. */

/** A day shows this many chips. The rest open from "+N". */
const SHOWN = 3;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** The Date Type mark: solid for a committed date, light for Ambition, dotted for Fantasy, hatched red for a slip. */
const markClass = (mark: CalendarMark) => (mark.date.slipDays !== undefined ? "slip" : mark.date.kind === "Promotion Milestone" ? "Committed" : mark.date.kind);

function chip(mark: CalendarMark, today: string): string {
  const { goal, date } = mark;
  const label = `${dateLabel(date, today)}${date.slipDays !== undefined ? ` · slip ${date.slipDays} days` : ""}`;
  return `<span class="chip" data-health="${goal.health ?? ""}" title="${escape(`${goal.summary} · ${label}`)}">${healthDot(goal.health)}<span class="ctitle">${escape(goal.summary)}</span><i class="mk ${markClass(mark)}" aria-hidden="true"></i><span class="vh">${escape(label)}</span></span>`;
}

function dayHtml(d: Day, today: string): string {
  const chips = d.marks.slice(0, SHOWN).map((m) => chip(m, today)).join("");
  const rest = d.marks.slice(SHOWN);
  const more = rest.length ? `<details class="more"><summary>+${rest.length}</summary><div class="morelist">${rest.map((m) => chip(m, today)).join("")}</div></details>` : "";
  const cls = `day${d.inMonth ? "" : " out"}${d.today ? " today" : ""}${d.marks.length ? " has" : ""}`;
  return `<div class="${cls}" data-date="${d.date}"${d.today ? ' aria-current="date"' : ""}><span class="dnum">${Number(d.date.slice(8))}</span><span class="dfull">${WEEKDAYS[(new Date(d.date).getUTCDay() + 6) % 7]} ${escape(shortDate(d.date, today))}</span>${chips}${more}</div>`;
}

function legendHtml(): string {
  const item = (mark: string, label: string) => `<span class="lg"><i class="mk ${mark}"></i>${escape(label)}</span>`;
  return `<div class="legend callegend">${item("Committed", "Committed date")}${item("Ambition", "Ambition date")}${item("Fantasy", "Fantasy date")}${item("slip", "Slip")}</div>`;
}

/** `search` sits above the grid, as wide as the goal column. */
export function calendarHtml(view: PrioritiesView, month: CalendarMonth, search: string): string {
  const filtering = Boolean(view.filter.health || view.filter.q);
  const none = filtering && !view.funded.length && !view.backlog.length ? '<p class="note muted">No goals match.</p>' : "";
  return `<div class="calbar"><div class="corner">${search}</div>${legendHtml()}</div>${none}
<div class="cal">
<div class="calhead">${WEEKDAYS.map((w) => `<span class="dow">${w}</span>`).join("")}</div>
${month.weeks.map((week) => `<div class="calweek">${week.map((d) => dayHtml(d, view.today)).join("")}</div>`).join("\n")}
</div>`;
}
