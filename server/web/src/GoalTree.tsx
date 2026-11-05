import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { ActorRef, Health } from "../../src/api.ts";
import { isLit, type GoalRow, type PriorityRow } from "./model/filter.ts";
import { dateLabel, listDates, slipLabel } from "./model/labels.ts";
import { focusAfterMove, moveIn, moveTo } from "./model/commands.ts";
import { canMove, changes, moveWords, nextGroup, spotAt, zoneOf, type Spot } from "./model/arrange.ts";
import { nameHover } from "./model/goalpage.ts";
import { goalPath } from "./model/route.ts";
import { Link, navigate } from "./router.tsx";
import { Avatar, CHEVRON, HealthDot, look, Rank } from "./parts.tsx";
import { encodeFocus } from "./model/feedback.ts";

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
  /** Rule 35b: the open top goals with no Priority, drawn last as No priority. */
  none?: GoalRow[];
  /** Rule 35b: drag a goal to arrange it, for a goal the actor may change and with no filter on. `save` answers an error to show, or nothing. */
  arrange?: { may: (goal: GoalRow) => boolean; save: (goal: string, spot: Spot, reason: string) => Promise<string | undefined> };
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

  const goal = (g: GoalRow, rank?: number, rails: number[] = [], last = true, lead?: ReactNode, parent: string | null = null, group: string | null = null): ReactNode => {
    const kids = g.children.length;
    const open = kids > 0 && (g.depth === 0 || filtering) !== flipped.has(g.id);
    const passing: CSSProperties = rails.length
      ? { backgroundImage: rails.map(() => "linear-gradient(var(--cut),var(--cut))").join(","), backgroundPosition: rails.map((l) => `${railX(l)} 0`).join(",") }
      : {};
    const guide = g.depth > 0 ? (last ? " tree" : " tree more") : "";
    const lit = isLit(g, props);
    const childRails = g.depth > 0 && !last ? [...rails, g.depth - 1] : rails;
    return (
      <div key={g.id} className="goal" data-focus={encodeFocus({ kind: "goal", id: g.id, label: g.summary })}>
        <div
          className={`row d${Math.min(g.depth, 2)}${g.match ? "" : " ctx"}${lit ? " lit" : ""}${kids ? " parent" : ""}${target(over?.spot) === g.id ? " dropinto" : ""}${moving === g.id ? " moving" : ""}`}
          data-health={g.health ?? ""}
          data-gid={g.id}
          data-parent={parent ?? undefined}
          data-group={group ?? "none"}
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
            {grip(g, parent, group)}
            {/* The title opens the goal page. The count chip alone opens and closes the tree (rule 19). */}
            <Link to={goalPath(g.id)} className="title" tabIndex={-1}>
              <span className="clamp" title={nameHover(g.id, g.summary)}>{g.summary}</span>
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
        {move && target(move.spot) === g.id && ask2()}
        {open && <div className="kids">{g.children.map((c, i) => goal(c, undefined, childRails, i === kids - 1, undefined, g.id, group))}</div>}
      </div>
    );
  };

  // Rule 35b: arranging goals. `moving` is the goal being dragged, `over` the spot under the pointer, `move` the drop that waits for its reason.
  const [moving, setMoving] = useState<string | null>(null);
  const [over, setOver] = useState<{ spot: Spot } | null>(null);
  const [move, setMove] = useState<{ goal: string; from: { priority: string | null; parent: string | null }; spot: Spot; via: "key" | "pointer" } | null>(null);
  const [why, setWhy] = useState("");
  const [moveError, setMoveError] = useState<string>();
  const trees = [...funded, ...backlog].flatMap((p) => p.goals).concat(props.none ?? []);
  const summaries = new Map<string, string>();
  const index = (list: GoalRow[]) => list.forEach((g) => (summaries.set(g.id, g.summary), index(g.children)));
  index(trees);
  const titles = new Map([...funded, ...backlog].map((p) => [p.id, `Priority ${p.rank} ${p.title}`]));
  const names = { goal: (id: string) => summaries.get(id) ?? id, priority: (id: string) => titles.get(id) ?? id };
  const groups: (string | null)[] = [...[...funded, ...backlog].map((p) => p.id), null];
  /** The row a spot marks: the new parent for a sub-goal. A move to a Priority marks its group instead. */
  const target = (spot?: Spot) => (spot?.kind === "into" ? spot.goal : spot?.kind === "beside" ? spot.parent : undefined);
  const spotUnder = (x: number, y: number, self: string): Spot | null => {
    const el = document.elementFromPoint(x, y);
    const row = el?.closest<HTMLElement>(".row[data-gid]");
    if (row && row.dataset.gid !== self) {
      const r = row.getBoundingClientRect();
      const group = row.dataset.group === "none" ? null : (row.dataset.group ?? null);
      return spotAt({ goal: row.dataset.gid as string, parent: row.dataset.parent ?? null, group }, zoneOf(y, r.top, r.height));
    }
    const box = el?.closest<HTMLElement>(".group[data-gpid]");
    if (box && !row) return { kind: "top", priority: box.dataset.gpid === "none" ? null : (box.dataset.gpid as string) };
    return null;
  };
  const begin = (g: GoalRow, from: { priority: string | null; parent: string | null }, spot: Spot, via: "key" | "pointer") => {
    setMoveError(undefined);
    if (!changes(from, spot) || !canMove(trees, g.id, spot)) return setMove(null);
    setMove({ goal: g.id, from, spot, via });
  };
  const grip = (g: GoalRow, parent: string | null, group: string | null) => {
    if (!props.arrange || filtering || !props.arrange.may(g)) return null;
    const from = { priority: parent ? null : group, parent };
    return (
      <button
        type="button"
        className="ggrip"
        aria-label={`Move ${g.summary}. Drag it into another goal or onto a Priority, or press arrow up or down to move it to the next Priority.`}
        title="Drag to move"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // A pointer the browser does not track; the moves still reach this button.
          }
          setMoving(g.id);
          setOver(null);
        }}
        onPointerMove={(e) => {
          if (moving !== g.id) return;
          const spot = spotUnder(e.clientX, e.clientY, g.id);
          setOver(spot && canMove(trees, g.id, spot) ? { spot } : null);
        }}
        onPointerUp={() => {
          if (moving === g.id && over) begin(g, from, over.spot, "pointer");
          setMoving(null);
          setOver(null);
        }}
        onPointerCancel={() => {
          setMoving(null);
          setOver(null);
        }}
        onKeyDown={(e) => {
          if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
          e.preventDefault();
          const at = move?.goal === g.id && move.spot.kind === "top" ? move.spot.priority : group;
          begin(g, from, { kind: "top", priority: nextGroup(groups, at, e.key === "ArrowUp" ? -1 : 1) }, "key");
        }}
      >
        <svg width="10" height="14" viewBox="0 0 10 14" aria-hidden="true">
          {[2, 7, 12].flatMap((y) => [<circle key={`a${y}`} cx="2.5" cy={y} r="1.5" />, <circle key={`b${y}`} cx="7.5" cy={y} r="1.5" />])}
        </svg>
      </button>
    );
  };
  const saveMove = async () => {
    if (!move || !props.arrange) return;
    const failed = await props.arrange.save(move.goal, move.spot, why);
    if (failed) return setMoveError(failed);
    setMove(null);
    setWhy("");
  };
  const ask2 = () =>
    move && (
      <div className="rankreason movereason">
        <span className="moveitem">{names.goal(move.goal)}:</span> <span className="movewhat">{moveWords(move.spot, names)}</span>
        <input value={why} placeholder="Reason" aria-label="Reason for the move" autoFocus={move.via === "pointer"} onChange={(e) => setWhy(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveMove()} />
        <button type="button" className="btn primary" onClick={saveMove}>
          Save
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setMove(null);
            setWhy("");
            setMoveError(undefined);
          }}
        >
          Undo
        </button>
        {moveError && <span className="ferror">{moveError}</span>}
      </div>
    );

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
    <div className={`group${drag?.id === p.id ? " dragging" : ""}${over?.spot.kind === "top" && over.spot.priority === p.id ? " droptop" : ""}`} key={p.id} data-pid={props.rank ? p.id : undefined} data-gpid={p.id} data-focus={encodeFocus({ kind: "priority", id: p.id, label: p.title })}>
      {drag && drag.at === order.indexOf(p.id) && <div className="dropline" aria-hidden="true" />}
      {p.goals.length ? (
        p.goals.map((g, i) => goal(g, i === 0 ? (pending ? order.indexOf(p.id) + 1 : p.rank) : undefined, undefined, undefined, i === 0 ? handle(p) : undefined, null, p.id))
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
      {move?.spot.kind === "top" && move.spot.priority === p.id && ask2()}
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
      {props.none && (props.none.length > 0 || !filtering) && (
        <div className={`group nonegroup${over?.spot.kind === "top" && over.spot.priority === null ? " droptop" : ""}`} data-gpid="none" data-focus={encodeFocus({ kind: "section", id: "No priority", label: "No priority" })}>
          <div className="row d0 nonehead" style={{ "--depth": 0 } as CSSProperties}>
            <div className="left">
              <Rank />
              <span className="title">No priority</span>
              <span className="slot" />
            </div>
            {blank}
          </div>
          {props.none.map((g) => goal(g, undefined, undefined, undefined, undefined, null, null))}
          {!props.none.length && <Note text={props.arrange ? "Not on Priorities. Drag a goal here to take it off its Priority." : "Every goal is on a Priority."} blank={blank} />}
          {move?.spot.kind === "top" && move.spot.priority === null && ask2()}
        </div>
      )}
    </>
  );
}
