import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { ActorRef, Health } from "../../src/api.ts";
import { isLit, type GoalRow, type PriorityRow } from "./model/filter.ts";
import { dateLabel, listDates, slipLabel } from "./model/labels.ts";
import { focusAfterMove, moveIn, moveTo } from "./model/commands.ts";
import { goalPath } from "./model/route.ts";
import { Link, navigate } from "./router.tsx";
import { Avatar, CHEVRON, HealthDot, look, Rank } from "./parts.tsx";

/** The x of the health dot's center at a level: the rank column, the gap, the indent, half the dot. The sizes are CSS variables on .board. */
const railX = (level: number) => `calc(var(--rank) + var(--colgap) + ${level} * var(--indent) + 5px)`;

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
  /** False in the List, where the health shows once, in its own column (rule 19a). */
  mark?: boolean;
  /** Rule 35: drag to reorder Priorities, for an actor who may (the server's mayRank) and with no filter on. `save` answers an error to show, or nothing. */
  rank?: { save: (order: string[], reason: string) => Promise<string | undefined> };
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
 * A row's line under its title on a phone: the health mark and word first, then the dates in the List's order,
 * the date health is judged on dark and the others light (rule 10, review: phone row). A sub-goal with its parent's date writes it muted.
 */
function When({ goal, today, chip }: { goal: GoalRow; today: string; chip?: ReactNode }) {
  const { own, pm, judged } = listDates(goal.dates.length ? goal.dates : goal.inherited);
  const dates = [...own, ...pm];
  if (!dates.length && goal.health === null && !chip) return null;
  return (
    <div className={`when${goal.dates.length ? "" : " inherited"}`}>
      <HealthDot health={goal.health} />
      {dates.map((d) => (
        <span key={d.kind} className={d === judged ? undefined : "light"}>
          {" · "}
          <span className="date">{dateLabel(d, today)}</span>
          {d.slipDays !== undefined && <span className="late"> · {slipLabel(d.slipDays)}</span>}
        </span>
      ))}
      {chip}
    </div>
  );
}

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

  const goal = (g: GoalRow, rank?: number, rails: number[] = [], last = true, lead?: ReactNode): ReactNode => {
    const kids = g.children.length;
    const open = kids > 0 && (g.depth === 0 || filtering) !== flipped.has(g.id);
    const passing: CSSProperties = rails.length
      ? { backgroundImage: rails.map(() => "linear-gradient(var(--cut),var(--cut))").join(","), backgroundPosition: rails.map((l) => `${railX(l)} 0`).join(",") }
      : {};
    const guide = g.depth > 0 ? (last ? " tree" : " tree more") : "";
    const lit = isLit(g, props);
    const childRails = g.depth > 0 && !last ? [...rails, g.depth - 1] : rails;
    return (
      <div key={g.id} className="goal">
        <div
          className={`row d${Math.min(g.depth, 2)}${g.match ? "" : " ctx"}${lit ? " lit" : ""}${kids ? " parent" : ""}`}
          data-health={g.health ?? ""}
          style={{ "--depth": g.depth, "--hc": look(g.health).bar } as CSSProperties}
          // Rule 19: a press anywhere on the row opens the goal, except on the count chip and the controls in it; the end of a pan is swallowed before it gets here (rule 20d).
          role="link"
          tabIndex={0}
          aria-label={g.summary}
          onClick={(e) => !(e.target as Element).closest("button, a, input, select") && navigate(goalPath(g.id))}
          onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && navigate(goalPath(g.id))}
        >
          <div className={`left${guide}`} style={passing}>
            {lead}
            <Rank rank={rank} />
            {props.mark !== false && <HealthDot health={g.health} />}
            {/* The title opens the goal page. The count chip alone opens and closes the tree (rule 19). */}
            <Link to={goalPath(g.id)} className="title" tabIndex={-1}>
              <span className="clamp">{g.summary}</span>
            </Link>
            <span className="slot">
              {kids > 0 && (
                <button type="button" className={`chev${open ? " open" : ""}`} aria-expanded={open} aria-label={`${open ? "Close" : "Open"} ${kids} sub-goals`} onClick={() => toggle(g.id)}>
                  <span className="n">{kids}</span>
                  {CHEVRON}
                </button>
              )}
            </span>
            <Avatar actor={g.owner} mine={g.owner.id === props.me.id} />
          </div>
          <When goal={g} today={props.today} chip={kids > 0 && (
            <button type="button" className={`chev inline${open ? " open" : ""}`} aria-expanded={open} aria-label={`${open ? "Close" : "Open"} ${kids} sub-goals`} onClick={() => toggle(g.id)}>
              <span className="n">{kids}</span>
              {CHEVRON}
            </button>
          )} />
          {props.cells(g)}
        </div>
        {open && <div className="kids">{g.children.map((c, i) => goal(c, undefined, childRails, i === kids - 1))}</div>}
      </div>
    );
  };

  // Rule 35: the order on screen, pending a reason after a move; the drag in progress and the drop line it shows.
  const base = [...funded, ...backlog].map((p) => p.id);
  const [pending, setPending] = useState<{ order: string[]; moved: string; via: "key" | "pointer" } | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [drag, setDrag] = useState<{ id: string; at: number } | null>(null);
  const order = pending?.order ?? base;
  const byId = new Map([...funded, ...backlog].map((p) => [p.id, p]));
  const lastFunded = funded[funded.length - 1]?.id;
  const moved = (next: string[], id: string, via: "key" | "pointer") => {
    if (next.join() === base.join()) return setPending(null);
    setPending({ order: next, moved: id, via });
    setError(undefined);
  };
  // A keyboard move can carry the Priority across the cut line, which draws its row again; give the handle its focus back.
  useEffect(() => {
    if (pending && focusAfterMove(pending.via) === "handle") document.querySelector<HTMLElement>(`.group[data-pid="${pending.moved}"] .draghandle`)?.focus();
  }, [pending]);
  const dropAt = (y: number) => {
    const rects = [...document.querySelectorAll<HTMLElement>(".group[data-pid]")].map((el) => el.getBoundingClientRect());
    const i = rects.findIndex((r) => y < r.top + r.height / 2);
    return i < 0 ? rects.length : i;
  };
  const handle = (p: PriorityRow) =>
    props.rank && (
      <button
        type="button"
        className="draghandle"
        aria-label={`Move Priority ${order.indexOf(p.id) + 1} ${p.title}. Arrow up or down moves it.`}
        title="Drag to reorder"
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag({ id: p.id, at: order.indexOf(p.id) });
        }}
        onPointerMove={(e) => drag && setDrag({ ...drag, at: dropAt(e.clientY) })}
        onPointerUp={() => {
          if (drag) moved(moveTo(order, drag.id, drag.at), drag.id, "pointer");
          setDrag(null);
        }}
        onPointerCancel={() => setDrag(null)}
        onKeyDown={(e) => {
          if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
          e.preventDefault();
          moved(moveIn(order, p.id, e.key === "ArrowUp" ? -1 : 1), p.id, "key");
        }}
      >
        <svg width="10" height="14" viewBox="0 0 10 14" aria-hidden="true">
          {[2, 7, 12].flatMap((y) => [<circle key={`a${y}`} cx="2.5" cy={y} r="1.5" />, <circle key={`b${y}`} cx="7.5" cy={y} r="1.5" />])}
        </svg>
      </button>
    );
  const save = async () => {
    if (!pending || !props.rank) return;
    const failed = await props.rank.save(pending.order, reason);
    if (failed) return setError(failed);
    setPending(null);
    setReason("");
  };
  const ask = (p: PriorityRow) =>
    pending?.moved === p.id && (
      <div className="rankreason">
        <input value={reason} placeholder="Reason" aria-label="Reason for the new order" autoFocus={focusAfterMove(pending.via) === "reason"} onChange={(e) => setReason(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
        <button type="button" className="btn primary" onClick={save}>
          Save
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setPending(null);
            setReason("");
            setError(undefined);
          }}
        >
          Undo
        </button>
        {error && <span className="ferror">{error}</span>}
      </div>
    );

  const group = (p: PriorityRow) => (
    <div className={`group${drag?.id === p.id ? " dragging" : ""}`} key={p.id} data-pid={props.rank ? p.id : undefined}>
      {drag && drag.at === order.indexOf(p.id) && <div className="dropline" aria-hidden="true" />}
      {p.goals.length ? (
        p.goals.map((g, i) => goal(g, i === 0 ? (pending ? order.indexOf(p.id) + 1 : p.rank) : undefined, undefined, undefined, i === 0 ? handle(p) : undefined))
      ) : (
        <div className="row d0" style={{ "--depth": 0 } as CSSProperties}>
          <div className="left">
            {handle(p)}
            <Rank rank={pending ? order.indexOf(p.id) + 1 : p.rank} />
            <HealthDot health={null} word={false} />
            <span className="title muted">{p.title}</span>
            <span className="slot" />
          </div>
          {blank}
        </div>
      )}
    </div>
  );

  const rows = (ids: string[]) =>
    ids.map((id) => {
      const p = byId.get(id) as PriorityRow;
      return (
        <div key={id} className="rankwrap">
          {group(p)}
          {ask(p)}
        </div>
      );
    });
  // While a move waits for its reason, the cut line stays on its Priority (SPEC.md §6.3).
  const cutAt = lastFunded ? order.indexOf(lastFunded) + 1 : 0;
  const shownFunded = pending ? order.slice(0, cutAt) : funded.map((p) => p.id);
  const shownBacklog = pending ? order.slice(cutAt) : backlog.map((p) => p.id);
  return (
    <>
      {rows(shownFunded)}
      {filtering && !funded.length && !backlog.length && <Note text="No goals match." blank={blank} />}
      {!filtering && !funded.length && <Note text="No Priorities above the cut line." blank={blank} />}
      {/* The cut line (SPEC.md §6.3), named once. */}
      <div className="cut">
        <span>✂ Cut line</span>
      </div>
      {shownBacklog.length ? rows(shownBacklog) : !filtering && <Note text="No Priorities below the cut line." blank={blank} />}
      {drag && drag.at === order.length && <div className="dropline" aria-hidden="true" />}
    </>
  );
}
