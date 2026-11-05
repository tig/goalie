import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { ActorRef, Health } from "../../src/api.ts";
import { isLit, type GoalRow, type PriorityRow } from "./model/filter.ts";
import { dateLabel, listDates, slipLabel } from "./model/labels.ts";
import { focusAfterMove, moveIn, moveTo } from "./model/commands.ts";
import { canMove, changes, edgeOf, movedWords, moveFields, moveWords, nextGroup, spotAt, zoneOf, type Spot } from "./model/arrange.ts";
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
          className={`row d${Math.min(g.depth, 2)}${g.match ? "" : " ctx"}${lit ? " lit" : ""}${kids ? " parent" : ""}${over?.zone === "in" && target(over.spot) === g.id ? " dropinto" : ""}${over?.zone === "edge" && over.row === g.id ? ` drop${over.edge}` : ""}${over?.zone === "edge" && over.spot.kind === "beside" && over.spot.parent === g.id ? " dropparent" : ""}${moving === g.id ? " moving" : ""}${note?.done && note.goal === g.id ? " justmoved" : ""}`}
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
            {/* In the List there is no health mark, so a sub-goal keeps its place free: the tree's connector ends there, not on the grip. */}
            {props.mark === false && g.depth > 0 && props.arrange && !filtering && <span className="dotgap" aria-hidden="true" />}
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
        {open && <div className="kids">{g.children.map((c, i) => goal(c, undefined, childRails, i === kids - 1, undefined, g.id, group))}</div>}
      </div>
    );
  };

  // Rule 35b: arranging goals. `moving` is the goal being dragged, `over` the spot under the pointer, `keyed` a keyboard move waiting for Enter,
  // and `note` the line at the bottom that says what was saved, with Undo. A drop saves at once; the app writes the reason.
  const [moving, setMoving] = useState<string | null>(null);
  /** The spot under the pointer, the row it is on (none for a Priority or No priority with no row), the line's side, and where the pointer is. */
  const [over, setOver] = useState<{ spot: Spot; row?: string; zone?: "in" | "edge"; edge?: "before" | "after"; x: number; y: number } | null>(null);
  type Place = { priority: string | null; parent: string | null };
  const [keyed, setKeyed] = useState<{ goal: string; from: Place; spot: Spot } | null>(null);
  const [note, setNote] = useState<{ goal: string; what: string; spot?: Spot; done: boolean; error?: string; undo?: { from: Place; spot: Spot } } | null>(null);
  const trees = [...funded, ...backlog].flatMap((p) => p.goals).concat(props.none ?? []);
  const summaries = new Map<string, string>();
  const index = (list: GoalRow[]) => list.forEach((g) => (summaries.set(g.id, g.summary), index(g.children)));
  index(trees);
  const mayIds = new Set<string>();
  const mark = (list: GoalRow[]) => list.forEach((g) => (props.arrange?.may(g) && mayIds.add(g.id), mark(g.children)));
  mark(trees);
  const titles = new Map([...funded, ...backlog].map((p) => [p.id, `Priority ${p.rank}: ${p.title}`]));
  const names = { goal: (id: string) => summaries.get(id) ?? id, priority: (id: string) => titles.get(id) ?? id };
  const groups: (string | null)[] = [...[...funded, ...backlog].map((p) => p.id), null];
  /** The row a spot marks: the new parent for a sub-goal. A move to a Priority marks its group instead. */
  const target = (spot?: Spot) => (spot?.kind === "into" ? spot.goal : spot?.kind === "beside" ? spot.parent : undefined);
  const spotUnder = (x: number, y: number, self: string): Omit<NonNullable<typeof over>, "x" | "y"> | null => {
    const el = document.elementFromPoint(x, y);
    const row = el?.closest<HTMLElement>(".row[data-gid]");
    if (row && row.dataset.gid !== self) {
      const r = row.getBoundingClientRect();
      const group = row.dataset.group === "none" ? null : (row.dataset.group ?? null);
      const zone = zoneOf(y, r.top, r.height);
      const spot = spotAt({ goal: row.dataset.gid as string, parent: row.dataset.parent ?? null, group }, zone);
      // A goal goes under another only when the actor may change that one too; else the top goal's row offers its Priority instead.
      const under = spot.kind === "into" ? spot.goal : spot.kind === "beside" ? spot.parent : null;
      if (under && !mayIds.has(under)) return row.dataset.parent ? null : { spot: { kind: "top", priority: group }, row: row.dataset.gid, zone: "edge", edge: edgeOf(y, r.top, r.height) };
      return { spot, row: row.dataset.gid, zone, edge: edgeOf(y, r.top, r.height) };
    }
    const box = el?.closest<HTMLElement>(".group[data-gpid]");
    if (box && !row) return { spot: { kind: "top", priority: box.dataset.gpid === "none" ? null : (box.dataset.gpid as string) } };
    return null;
  };
  /** Where a goal was, as a spot, so Undo can put it back. */
  const back = (from: Place): Spot => (from.parent ? { kind: "into", goal: from.parent } : { kind: "top", priority: from.priority });
  const commit = async (goal: string, from: Place, spot: Spot) => {
    setKeyed(null);
    if (!props.arrange || !changes(from, spot) || !canMove(trees, goal, spot)) return;
    const what = moveWords(spot, names);
    setNote({ goal, what, done: false });
    const failed = await props.arrange.save(goal, spot, `Moved on Home. ${what}.`);
    setNote(failed ? { goal, what, done: false, error: failed } : { goal, what, spot, done: true, undo: { from: moveFields(spot), spot: back(from) } });
  };
  const grip = (g: GoalRow, parent: string | null, group: string | null) => {
    if (!props.arrange || filtering) return null;
    // A goal this actor may not move shows a dimmed grip that says who may, so a missing grip is never a mystery.
    if (!props.arrange.may(g))
      return (
        <span className="ggrip off" title={`Only ${g.owner.name} can move this goal.`} aria-hidden="true">
          <svg width="10" height="14" viewBox="0 0 10 14">
            {[2, 7, 12].flatMap((y) => [<circle key={`a${y}`} cx="2.5" cy={y} r="1.5" />, <circle key={`b${y}`} cx="7.5" cy={y} r="1.5" />])}
          </svg>
        </span>
      );
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
          setNote(null);
        }}
        onPointerMove={(e) => {
          if (moving !== g.id) return;
          const at = spotUnder(e.clientX, e.clientY, g.id);
          setOver(at && canMove(trees, g.id, at.spot) ? { ...at, x: e.clientX, y: e.clientY } : null);
        }}
        onPointerUp={() => {
          if (moving === g.id && over) void commit(g.id, from, over.spot);
          setMoving(null);
          setOver(null);
        }}
        onPointerCancel={() => {
          setMoving(null);
          setOver(null);
        }}
        onKeyDown={(e) => {
          // Arrow up or down picks the next Priority; Enter moves it there and Escape lets it be.
          if (e.key === "Enter" && keyed?.goal === g.id) {
            e.preventDefault();
            return void commit(g.id, keyed.from, keyed.spot);
          }
          if (e.key === "Escape" && keyed) return setKeyed(null);
          if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
          e.preventDefault();
          const at = keyed?.goal === g.id && keyed.spot.kind === "top" ? keyed.spot.priority : group;
          const spot: Spot = { kind: "top", priority: nextGroup(groups, at, e.key === "ArrowUp" ? -1 : 1) };
          setNote(null);
          setKeyed(changes(from, spot) ? { goal: g.id, from, spot } : null);
        }}
      >
        <svg width="10" height="14" viewBox="0 0 10 14" aria-hidden="true">
          {[2, 7, 12].flatMap((y) => [<circle key={`a${y}`} cx="2.5" cy={y} r="1.5" />, <circle key={`b${y}`} cx="7.5" cy={y} r="1.5" />])}
        </svg>
      </button>
    );
  };
  /** The line at the bottom: a keyboard move waiting for Enter, a save in progress, what was saved with Undo, or the server's refusal. */
  const moveNote = () => {
    if (keyed)
      return (
        <div className="movenote" role="status">
          <span className="movetext">
            <span className="moveitem">{names.goal(keyed.goal)}</span> <span className="movewhat">{moveWords(keyed.spot, names)}</span> <span className="small">Enter moves it. Escape lets it be.</span>
          </span>
        </div>
      );
    if (!note) return null;
    return (
      <div className={`movenote${note.error ? " bad" : ""}`} role="status">
        <span className="movetext">
          <span className="moveitem">{names.goal(note.goal)}</span> <span className="movewhat">{note.done && note.spot ? movedWords(note.spot, names) : note.what}</span>
        </span>
        {!note.done && !note.error && <span className="small"> Saving…</span>}
        {note.error && <span className="ferror">Not moved. {note.error.replace(/^[a-z0-9_-]+: /, "")}</span>}
        {note.undo && (
          <button type="button" className="btn" onClick={() => note.undo && void commit(note.goal, note.undo.from, note.undo.spot)}>
            Undo
          </button>
        )}
        <button type="button" className="linkbtn" aria-label="Close" onClick={() => setNote(null)}>
          ×
        </button>
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
    <div className={`group${drag?.id === p.id ? " dragging" : ""}${over && !over.row && over.spot.kind === "top" && over.spot.priority === p.id ? " droptop" : ""}`} key={p.id} data-pid={props.rank ? p.id : undefined} data-gpid={p.id} data-focus={encodeFocus({ kind: "priority", id: p.id, label: p.title })}>
      {drag && drag.at === order.indexOf(p.id) && <div className="dropline" aria-hidden="true" />}
      {/* Rule 10b: each Priority is a header row, its number and title. Its top goals sit under it with no number. */}
      <div className="row d0 phead" style={{ "--depth": 0 } as CSSProperties}>
        <div className="left">
          {handle(p)}
          <Rank rank={pending ? order.indexOf(p.id) + 1 : p.rank} />
          <span className="title">{p.title}</span>
          <span className="slot" />
        </div>
        {blank}
      </div>
      {p.goals.map((g) => goal(g, undefined, undefined, undefined, undefined, null, p.id))}
      {!p.goals.length && <Note text={props.arrange ? "No goals yet. Drag a goal here." : "No goals yet."} blank={blank} />}
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
      {!(moving && over) && moveNote()}
      {moving && over && (
        // While dragging, what the drop will do shows where the saved note shows, so it covers nothing on the board.
        <div className="movenote dragghost" aria-hidden="true">
          <span className="movetext">
            <b>{names.goal(moving)}</b> → {moveWords(over.spot, names)}
          </span>
        </div>
      )}
      {props.none && (props.none.length > 0 || !filtering) && (
        <div className={`group nonegroup${over && !over.row && over.spot.kind === "top" && over.spot.priority === null ? " droptop" : ""}`} data-gpid="none" data-focus={encodeFocus({ kind: "section", id: "No priority", label: "No priority" })}>
          <div className="row d0 phead nonehead" style={{ "--depth": 0 } as CSSProperties}>
            <div className="left">
              <Rank />
              <span className="title">No priority</span>
              <span className="slot" />
            </div>
            {blank}
          </div>
          {props.none.map((g) => goal(g, undefined, undefined, undefined, undefined, null, null))}
          {!props.none.length && <Note text={props.arrange ? "Not on Priorities. Drag a goal here to take it off its Priority." : "Every goal is on a Priority."} blank={blank} />}
        </div>
      )}
    </>
  );
}
