import type { ReactNode } from "react";
import type { GoalDate } from "../../src/api.ts";
import { shortDate } from "../../src/dates.ts";
import type { GoalRow } from "./model/filter.ts";
import { dateLabel, listDates, slipLabel } from "./model/labels.ts";
import { GoalTree, type TreeProps } from "./GoalTree.tsx";
import { HealthDot } from "./parts.tsx";

/** The saved view's columns right of the goal column. Summary and Owner are the goal column itself. */
const listColumns = (columns: readonly string[]) => columns.filter((c) => c !== "Summary" && c !== "Owner");

/** A column's title. PTG is spelled out once (review X7). */
const TITLES: Record<string, string> = { PTG: "Path to Green (PTG)" };

const slug = (column: string) => column.replace(/ /g, "-").toLowerCase();

/** A date with its Date Type, dark when health is judged on it and light otherwise. A slip follows in red. */
function DateText({ date, judged, today, kind = true }: { date: GoalDate; judged: boolean; today: string; kind?: boolean }) {
  return (
    <span className={judged ? "date" : "date light"}>
      {kind ? dateLabel(date, today) : shortDate(date.date, today)}
      {date.slipDays !== undefined && <span className="late"> · {slipLabel(date.slipDays)}</span>}
    </span>
  );
}

function cell(column: string, goal: GoalRow, today: string): ReactNode {
  const { own, pm, judged } = listDates(goal.dates);
  switch (column) {
    case "Health":
      return <HealthDot health={goal.health} word="shown" />;
    case "Date Type":
      // The goal's own date. A sub-goal with its parent's date writes it muted (review X6).
      if (!goal.dates.length) {
        const inherited = listDates(goal.inherited);
        const d = inherited.judged ?? goal.inherited[0];
        return d ? <span className="inherited"><DateText date={d} judged={false} today={today} /></span> : null;
      }
      return own.map((d, i) => (
        <span key={i}>
          {i > 0 && " · "}
          <DateText date={d} judged={d === judged} today={today} />
        </span>
      ));
    case "Promotion Milestone":
      // The column title names it, so the cell writes only its date.
      return pm.map((d, i) => (
        <span key={i}>
          <span className="pfx">Promotion Milestone </span>
          <DateText date={d} judged={d === judged} today={today} kind={false} />
        </span>
      ));
    case "PTG":
      if (!goal.ptg) return goal.health === "RED" || goal.health === "YELLOW" ? <span className="muted">No Path to Green</span> : null;
      return (
        <>
          <span className="pfx">PTG </span>
          {goal.ptg.text}
          {goal.ptg.owner && <span className="muted"> · {goal.ptg.owner.name}</span>}
        </>
      );
    default:
      return null;
  }
}

/**
 * The Priorities as a list (rule V2): one grid of rank, Priority (the tree), Owner, Health, Date Type, Promotion Milestone, and Path to Green (PTG),
 * titled once in a header that stays on screen. Only the title wraps. On a narrow board Promotion Milestone and PTG drop to a second line in the row.
 */
export function ListView({ columns, ...tree }: Omit<TreeProps, "cells" | "blank" | "mark"> & { columns: readonly string[] }) {
  const cols = listColumns(columns);
  return (
    <div className="list">
      <div className="lhead">
        <span className="col c-priority">Priority</span>
        <span className="col c-owner">Owner</span>
        {cols.map((c) => (
          <span key={c} className={`col c-${slug(c)}`}>
            {TITLES[c] ?? c}
          </span>
        ))}
      </div>
      <div className="lbody">
        <GoalTree
          {...tree}
          mark={false}
          cells={(goal) =>
            cols.map((c) => (
              <span key={c} className={`cell c-${slug(c)}`}>
                {cell(c, goal, tree.today)}
              </span>
            ))
          }
          blank={cols.map((c) => <span key={c} className="cell" />)}
        />
      </div>
    </div>
  );
}
