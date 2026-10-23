import type { ReactNode } from "react";
import type { GoalDate } from "../../src/api.ts";
import type { GoalRow } from "./model/filter.ts";
import { GoalTree, type TreeProps } from "./GoalTree.tsx";
import { DateMark, look } from "./parts.tsx";

/** The saved view's columns right of the goal column. Summary and Owner are the goal column itself. */
const listColumns = (columns: readonly string[]) => columns.filter((c) => c !== "Summary" && c !== "Owner");

const Dates = ({ dates, today }: { dates: GoalDate[]; today: string }) => (
  <>
    {dates.map((d, i) => (
      <span key={i}>
        {i > 0 && " · "}
        <DateMark date={d} today={today} />
      </span>
    ))}
  </>
);

function cell(column: string, goal: GoalRow, today: string): ReactNode {
  switch (column) {
    case "Health":
      return goal.health && <span style={{ color: look(goal.health).ink }}>{goal.health}</span>;
    case "Date Type":
      return <Dates dates={goal.dates.filter((d) => d.kind !== "Promotion Milestone")} today={today} />;
    case "Promotion Milestone":
      return <Dates dates={goal.dates.filter((d) => d.kind === "Promotion Milestone")} today={today} />;
    case "PTG":
      return (
        goal.ptg && (
          <>
            {goal.ptg.text}
            {goal.ptg.owner && <span className="muted"> · {goal.ptg.owner.name}</span>}
          </>
        )
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
      <div className="lhead">
        <div className="corner">{search}</div>
        {cols.map((c) => (
          <span key={c} className={`col c-${slug(c)}`}>
            {c}
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
