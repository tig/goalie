import type { ReactNode } from "react";
import type { GoalDate } from "../../src/api.ts";
import type { GoalRow } from "./model/filter.ts";
import { isCommitted } from "./model/labels.ts";
import { GoalTree, type TreeProps } from "./GoalTree.tsx";
import { DateMark, look } from "./parts.tsx";

/** The saved view's columns right of the goal column. Summary and Owner are the goal column itself. */
const listColumns = (columns: readonly string[]) => columns.filter((c) => c !== "Summary" && c !== "Owner");

/** `light` marks the dates after the first in light text. */
const Dates = ({ dates, today, light = false }: { dates: GoalDate[]; today: string; light?: boolean }) => (
  <>
    {dates.map((d, i) => (
      <span key={i} className={light && i > 0 ? "muted light" : undefined}>
        {i > 0 && " · "}
        <DateMark date={d} today={today} />
      </span>
    ))}
  </>
);

/** The date health is judged on first, then the uncommitted date, light (review X8). A sub-goal with its parent's date writes it muted (review X6). */
function judged(goal: GoalRow, today: string): ReactNode {
  if (!goal.dates.length) return goal.inherited.length ? <span className="muted inherited"><Dates dates={goal.inherited.filter(isCommitted).slice(0, 1)} today={today} /></span> : null;
  const sorted = [...goal.dates.filter(isCommitted), ...goal.dates.filter((d) => !isCommitted(d))];
  return <Dates dates={sorted} today={today} light />;
}

/** A column's title. PTG is spelled out once (review X7). */
const TITLES: Record<string, string> = { PTG: "Path to Green (PTG)" };

function cell(column: string, goal: GoalRow, today: string): ReactNode {
  switch (column) {
    case "Health":
      return goal.health && <span style={{ color: look(goal.health).ink }}>{goal.health}</span>;
    case "Date Type":
      return judged(goal, today);
    case "Promotion Milestone":
      return <Dates dates={goal.dates.filter((d) => d.kind === "Promotion Milestone")} today={today} />;
    case "PTG":
      if (!goal.ptg) return goal.health === "RED" || goal.health === "YELLOW" ? <span className="muted">No Path to Green</span> : null;
      return (
        <>
          {goal.ptg.text}
          {goal.ptg.owner && <span className="muted"> · {goal.ptg.owner.name}</span>}
        </>
      );
    default:
      return null;
  }
}

const slug = (column: string) => column.replace(/ /g, "-").toLowerCase();

/** The Priorities as a list: the saved definition's columns (SPEC.md §8.2), one aligned row per goal, in the same tree as the timeline. */
export function ListView({ columns, search, ...tree }: Omit<TreeProps, "cells" | "blank"> & { columns: readonly string[]; search: ReactNode }) {
  const cols = listColumns(columns);
  return (
    <div className="list" style={{ "--cols": cols.length } as React.CSSProperties}>
      <div className="lsearch">{search}</div>
      {/* The goal column's title says the numbers are Priority ranks (review X14). Owner names the avatars. */}
      <div className="lhead">
        <span className="col c-goal">
          <span className="c-priority">Priority</span>
          <span className="c-owner">Owner</span>
        </span>
        {cols.map((c) => (
          <span key={c} className={`col c-${slug(c)}`}>
            {TITLES[c] ?? c}
          </span>
        ))}
      </div>
      <div className="lbody">
        <GoalTree
          {...tree}
          cells={(goal) =>
            cols.map((c) => (
              <span key={c} className={`cell c-${slug(c)}`} aria-hidden={c === "Health" || undefined}>
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
