import { dateMark, escape, look, priorityRows, type Actor } from "./components.ts";
import { PRIORITIES_VIEW, type GoalDate, type GoalRow, type PrioritiesView } from "./priorities.ts";

/** The Priorities view drawn as a list: the saved definition's columns (SPEC.md §8.2), one aligned row per goal, in the same tree as the timeline. */

/** The columns right of the goal column. Summary and Owner are the goal column itself. */
const COLUMNS = PRIORITIES_VIEW.columns.filter((c) => c !== "Summary" && c !== "Owner");

function datesHtml(dates: GoalDate[], today: string): string {
  return dates.map((d) => `${dateMark(d, today)}${d.slipDays !== undefined ? ` <span class="late">slip ${d.slipDays} days</span>` : ""}`).join(" · ");
}

function cells(goal: GoalRow, today: string): string {
  const own = goal.dates.filter((d) => d.kind !== "Promotion Milestone");
  const milestone = goal.dates.filter((d) => d.kind === "Promotion Milestone");
  const health = goal.health ? `<span style="color:${look(goal.health).ink}">${goal.health}</span>` : "";
  const ptg = goal.ptg ? `${escape(goal.ptg.text)}${goal.ptg.ownerName ? ` <span class="muted">· ${escape(goal.ptg.ownerName)}</span>` : ""}` : "";
  const values: Record<(typeof COLUMNS)[number], string> = {
    "Date Type": datesHtml(own, today),
    "Promotion Milestone": datesHtml(milestone, today),
    Health: health,
    PTG: ptg,
  };
  return COLUMNS.map((c) => `<span class="cell c-${c.replace(/ /g, "-").toLowerCase()}"${c === "Health" ? ' aria-hidden="true"' : ""}>${values[c]}</span>`).join("");
}

/** `search` sits above the goal column. `ids` gives rows their goal ids; the copy a timeline page carries for the phone has none, and `phone` marks it. */
export function listHtml(view: PrioritiesView, actor: Actor, search: string, phone = false): string {
  const drawing = {
    actor,
    filtering: Boolean(view.filter.health || view.filter.q),
    ids: !phone,
    cells: (goal: GoalRow) => cells(goal, view.today),
    blank: COLUMNS.map(() => '<span class="cell"></span>').join(""),
  };
  return `<div class="list${phone ? " phone" : ""}">
<div class="lhead"><div class="corner">${search}</div>${COLUMNS.map((c) => `<span class="col">${escape(c)}</span>`).join("")}</div>
<div class="lbody">
${priorityRows(drawing, view.funded, view.backlog)}
</div>
</div>`;
}
