import { useState, type CSSProperties, type ReactNode } from "react";
import type { ActorRef, Health } from "../../src/api.ts";
import { dateLabel } from "./model/dates.ts";
import type { GoalRow, PriorityRow } from "./model/filter.ts";
import { Avatar, CHEVRON, HealthDot, look, Rank } from "./parts.tsx";

/** Each tree level indents this much. */
const INDENT = 26;
/** The x of the health dot's center at a level: the rank column, the gap, the indent, half the dot. */
const railX = (level: number) => `${28 + level * INDENT + 5}px`;

export type TreeProps = {
  funded: PriorityRow[];
  backlog: PriorityRow[];
  me: ActorRef;
  today: string;
  filtering: boolean;
  /** The health a filter shows (rule H3) and the health being pointed at (rule H2). */
  selected?: Health;
  hot?: Health;
  /** The cells right of the goal column. */
  cells: (goal: GoalRow) => ReactNode;
  /** The cells of a row with no goal. */
  blank: ReactNode;
};

/** A line of text in the goal column, pinned like a goal name. */
const Note = ({ text, blank }: { text: string; blank: ReactNode }) => (
  <div className="row note">
    <div className="left">
      <Rank />
      <span className="title muted">{text}</span>
    </div>
    {blank}
  </div>
);

/**
 * The funded Priorities, the cut line, then the backlog. Every row has the same columns: rank, health, title, count, owner.
 * A top-level goal starts open, a deeper one closed. A filter opens every level. The List and the Timeline share it.
 */
export function GoalTree(props: TreeProps) {
  const [flipped, setFlipped] = useState<ReadonlySet<string>>(new Set());
  const [wasFiltering, setWasFiltering] = useState(props.filtering);
  if (wasFiltering !== props.filtering) {
    // A filter opens every level; clearing it goes back to the default tree.
    setWasFiltering(props.filtering);
    setFlipped(new Set());
  }
  const toggle = (id: string) => setFlipped((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set([...s, id])));
  const { funded, backlog, filtering, blank } = props;

  const goal = (g: GoalRow, rank?: number, rails: number[] = [], last = true): ReactNode => {
    const kids = g.children.length;
    const open = kids > 0 && (g.depth === 0 || filtering) !== flipped.has(g.id);
    const passing: CSSProperties = rails.length
      ? { backgroundImage: rails.map(() => "linear-gradient(var(--cut),var(--cut))").join(","), backgroundPosition: rails.map((l) => `${railX(l)} 0`).join(",") }
      : {};
    const guide = g.depth > 0 ? (last ? " tree" : " tree more") : "";
    const lit = (props.selected && g.match && g.health === props.selected) || (props.hot !== undefined && g.health === props.hot);
    const control = kids
      ? { role: "button", tabIndex: 0, "aria-expanded": open, onClick: () => toggle(g.id), onKeyDown: (e: React.KeyboardEvent) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle(g.id)) }
      : {};
    const childRails = g.depth > 0 && !last ? [...rails, g.depth - 1] : rails;
    return (
      <div key={g.id} className="goal">
        <div
          className={`row d${Math.min(g.depth, 2)}${g.match ? "" : " ctx"}${lit ? " lit" : ""}${kids ? " parent" : ""}`}
          data-health={g.health ?? ""}
          style={{ "--depth": g.depth, "--hc": look(g.health).bar } as CSSProperties}
          {...control}
        >
          <div className={`left${guide}`} style={passing}>
            <Rank rank={rank} />
            <HealthDot health={g.health} />
            <span className="title">{g.summary}</span>
            <span className="slot">
              {kids > 0 && (
                <span className={`chev${open ? " open" : ""}`}>
                  <span className="n">{kids}</span>
                  {CHEVRON}
                </span>
              )}
            </span>
            <Avatar actor={g.owner} mine={g.owner.id === props.me.id} />
          </div>
          {g.dates.length > 0 && (
            <div className="when">
              {g.dates.map((d) => `${dateLabel(d, props.today)}${d.slipDays !== undefined ? ` · slip ${d.slipDays} days` : ""}`).join(" · ")}
            </div>
          )}
          {props.cells(g)}
        </div>
        {open && <div className="kids">{g.children.map((c, i) => goal(c, undefined, childRails, i === kids - 1))}</div>}
      </div>
    );
  };

  const group = (p: PriorityRow) => (
    <div className="group" key={p.id}>
      {p.goals.length ? (
        p.goals.map((g, i) => goal(g, i === 0 ? p.rank : undefined))
      ) : (
        <div className="row d0" style={{ "--depth": 0 } as CSSProperties}>
          <div className="left">
            <Rank rank={p.rank} />
            <HealthDot health={null} />
            <span className="title muted">{p.title}</span>
            <span className="slot" />
          </div>
          {blank}
        </div>
      )}
    </div>
  );

  return (
    <>
      {funded.map(group)}
      {filtering && !funded.length && !backlog.length && <Note text="No goals match." blank={blank} />}
      <div className="cut">
        <span>✂ Backlog</span>
      </div>
      {backlog.length ? backlog.map(group) : !filtering && <Note text="No Priorities below the cut line." blank={blank} />}
    </>
  );
}
