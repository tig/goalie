import { useState, type CSSProperties, type ReactNode } from "react";
import type { ActorRef, Health } from "../../src/api.ts";
import { isLit, type GoalRow, type PriorityRow } from "./model/filter.ts";
import { dateLabel, listDates, slipLabel } from "./model/labels.ts";
import { canMove, edgeOf, holdsAlone, mayMove, movedWords, moveWords, nextPlace, placeOf, places, rankSpot, zoneOf, type Mover, type Slot, type Spot } from "./model/arrange.ts";
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
  /** Rule 35b: the open top goals with no Priority, drawn last as No priority. */
  none?: GoalRow[];
  /**
   * Rule 35b: drag a goal, with no filter on. `may` is the right on a goal, `mayRank` the right to change the numbers (SPEC.md §6.3).
   * `slots` are the top rows in order, `plan` the batch a move would send (null when it changes nothing), and `save` answers an error to show, or nothing.
   */
  arrange?: {
    may: (goal: GoalRow) => boolean;
    mayRank: boolean;
    slots: Slot[];
    plan: (goal: Mover, spot: Spot) => unknown;
    save: (goal: string, spot: Spot, reason: string) => Promise<string | undefined>;
  };
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

  const goal = (g: GoalRow, rank?: number, rails: number[] = [], last = true, lead?: ReactNode, parent: string | null = null, group: string | null = null, top?: { ri: number; funded: boolean }): ReactNode => {
    const kids = g.children.length;
    const open = kids > 0 && (g.depth === 0 || filtering) !== flipped.has(g.id);
    // Below an open top goal the drop line goes under its whole tree, so it never reads as a sub-goal drop.
    const blockAfter = Boolean(open && top && over?.zone === "edge" && over.row === g.id && over.edge === "after");
    const passing: CSSProperties = rails.length
      ? { backgroundImage: rails.map(() => "linear-gradient(var(--cut),var(--cut))").join(","), backgroundPosition: rails.map((l) => `${railX(l)} 0`).join(",") }
      : {};
    const guide = g.depth > 0 ? (last ? " tree" : " tree more") : "";
    const lit = isLit(g, props);
    const childRails = g.depth > 0 && !last ? [...rails, g.depth - 1] : rails;
    return (
      <div key={g.id} className={`goal${blockAfter ? " dropafter" : ""}`} data-focus={encodeFocus({ kind: "goal", id: g.id, label: g.summary })}>
        <div
          className={`row d${Math.min(g.depth, 2)}${g.match ? "" : " ctx"}${lit ? " lit" : ""}${kids ? " parent" : ""}${over?.zone === "in" && over.spot.kind === "into" && over.spot.goal === g.id ? " dropinto" : ""}${over?.zone === "edge" && over.row === g.id && !blockAfter ? ` drop${over.edge}` : ""}${over?.zone === "edge" && over.spot.kind === "beside" && over.spot.parent === g.id ? " dropparent" : ""}${moving === g.id ? " moving" : ""}${note?.done && note.goal === g.id ? " justmoved" : ""}`}
          data-health={g.health ?? ""}
          data-gid={g.id}
          data-parent={parent ?? undefined}
          data-group={group ?? "none"}
          data-ri={top?.ri}
          data-side={top ? (top.funded ? "funded" : "backlog") : undefined}
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
            {grip(g)}
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
  /** The spot under the pointer, the row it is on, the zone and the line's side, and where the pointer is. */
  const [over, setOver] = useState<{ spot: Spot; row?: string; zone?: "in" | "edge"; edge?: "before" | "after"; x: number; y: number } | null>(null);
  const [keyed, setKeyed] = useState<{ goal: string; from: Spot; spot: Spot } | null>(null);
  const [note, setNote] = useState<{ goal: string; what: string; spot?: Spot; done: boolean; error?: string; undo?: Spot } | null>(null);
  const trees = [...funded, ...backlog].flatMap((p) => p.goals).concat(props.none ?? []);
  const summaries = new Map<string, string>();
  const rows = new Map<string, { goal: GoalRow; parent: string | null; group: string | null }>();
  const index = (list: GoalRow[], parent: string | null, group: string | null) => list.forEach((g) => (summaries.set(g.id, g.summary), rows.set(g.id, { goal: g, parent, group }), index(g.children, g.id, group)));
  [...funded, ...backlog].forEach((p) => index(p.goals, null, p.id));
  index(props.none ?? [], null, null);
  const names = { goal: (id: string) => summaries.get(id) ?? id };
  const slots = props.arrange?.slots ?? [];
  const mayGoal = (id: string) => {
    const r = rows.get(id);
    return Boolean(r && props.arrange?.may(r.goal));
  };
  /** The goal as a move reads it. Versions are read at save time. */
  const mover = (id: string): Mover => {
    const r = rows.get(id);
    return { id, version: 0, summary: summaries.get(id) ?? id, priority: r && !r.parent ? r.group : null, parent: r?.parent ?? null };
  };
  /** A move the actor may make, that changes something, and that does not put a goal into its own tree. */
  const allowed = (id: string, spot: Spot) =>
    Boolean(props.arrange) &&
    mayMove({ rank: Boolean(props.arrange?.mayRank), goal: mayGoal(id) }, holdsAlone(slots, id), spot) &&
    (spot.kind !== "into" || mayGoal(spot.goal)) &&
    (spot.kind !== "beside" || mayGoal(spot.parent)) &&
    canMove(trees, id, spot) &&
    props.arrange?.plan(mover(id), spot) != null;
  const fundedRest = (self: string) => slots.filter((s) => s.funded && s.goal !== self).length;
  const spotUnder = (x: number, y: number, self: string): Omit<NonNullable<typeof over>, "x" | "y"> | null => {
    const el = document.elementFromPoint(x, y);
    const row = el?.closest<HTMLElement>(".row[data-gid], .row[data-ri]");
    if (row && row.dataset.gid !== self) {
      const r = row.getBoundingClientRect();
      const key = row.dataset.gid ?? `p:${row.dataset.ri}`;
      const edge = edgeOf(y, r.top, r.height);
      const zone = row.dataset.gid ? zoneOf(y, r.top, r.height) : "edge";
      const from = slots.findIndex((s) => s.goal === self);
      // The edge of a top row is a place in the ranked list; the edge of a sub-goal places it beside; a goal with no Priority places it in No priority.
      const besideSpot: Spot = row.dataset.side
        ? rankSpot(Number(row.dataset.ri), edge, row.dataset.side === "funded", from)
        : row.dataset.parent
          ? { kind: "beside", parent: row.dataset.parent }
          : { kind: "none" };
      if (zone === "in") {
        const into: Spot = { kind: "into", goal: row.dataset.gid as string };
        if (allowed(self, into)) return { spot: into, row: key, zone };
      }
      return allowed(self, besideSpot) ? { spot: besideSpot, row: key, zone: "edge", edge } : null;
    }
    // The Backlog line takes a goal to the top of Backlog.
    if (el?.closest(".cut")) {
      const spot: Spot = { kind: "rank", index: fundedRest(self), funded: false };
      return allowed(self, spot) ? { spot } : null;
    }
    if (el?.closest(".group[data-gpid='none']")) {
      const spot: Spot = { kind: "none" };
      return allowed(self, spot) ? { spot } : null;
    }
    return null;
  };
  /** Where a goal is now, as a spot, so Undo can put it back. */
  const placeNow = (id: string): Spot => {
    const r = rows.get(id);
    return r?.parent ? { kind: "into", goal: r.parent } : placeOf(slots, id);
  };
  const commit = async (goal: string, spot: Spot, undo: Spot) => {
    setKeyed(null);
    if (!props.arrange || !allowed(goal, spot)) return;
    const what = moveWords(spot, names);
    setNote({ goal, what, done: false });
    const failed = await props.arrange.save(goal, spot, `Moved on Home. ${what}.`);
    setNote(failed ? { goal, what, done: false, error: failed } : { goal, what, spot, done: true, undo });
  };
  const DOTS = (
    <svg width="10" height="14" viewBox="0 0 10 14" aria-hidden="true">
      {[2, 7, 12].flatMap((y) => [<circle key={`a${y}`} cx="2.5" cy={y} r="1.5" />, <circle key={`b${y}`} cx="7.5" cy={y} r="1.5" />])}
    </svg>
  );
  const grip = (g: GoalRow) => {
    if (!props.arrange || filtering) return null;
    const may = { rank: props.arrange.mayRank, goal: props.arrange.may(g) };
    const alone = holdsAlone(slots, g.id);
    const any = mayMove(may, alone, { kind: "rank", index: 0, funded: true }) || mayMove(may, alone, { kind: "none" });
    // A goal this actor may not move shows a dimmed grip that says who may, so a missing grip is never a mystery.
    if (!any)
      return (
        <span className="ggrip off" title={may.goal ? "Only the org unit's owner can change the numbers." : `Only ${g.owner.name} can move this goal.`} aria-hidden="true">
          {DOTS}
        </span>
      );
    const choices = () => places(slots, g.id).filter((p) => allowed(g.id, p) || JSON.stringify(p) === JSON.stringify(placeOf(slots, g.id)));
    return (
      <button
        type="button"
        className="ggrip"
        aria-label={`Move ${g.summary}. Drag it to a new number, below the Backlog line, or into another goal, or press arrow up or down to pick a place.`}
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
          setOver(at ? { ...at, x: e.clientX, y: e.clientY } : null);
        }}
        onPointerUp={() => {
          if (moving === g.id && over) void commit(g.id, over.spot, placeNow(g.id));
          setMoving(null);
          setOver(null);
        }}
        onPointerCancel={() => {
          setMoving(null);
          setOver(null);
        }}
        onKeyDown={(e) => {
          // Arrow up or down picks the next place; Enter moves it there and Escape lets it be.
          if (e.key === "Enter" && keyed?.goal === g.id) {
            e.preventDefault();
            return void commit(g.id, keyed.spot, keyed.from);
          }
          if (e.key === "Escape" && keyed) return setKeyed(null);
          if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
          e.preventDefault();
          const from = placeNow(g.id);
          const spot = nextPlace(choices(), keyed?.goal === g.id ? keyed.spot : placeOf(slots, g.id), e.key === "ArrowUp" ? -1 : 1);
          setNote(null);
          setKeyed(spot && allowed(g.id, spot) ? { goal: g.id, from, spot } : null);
        }}
      >
        {DOTS}
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
          <button type="button" className="btn" onClick={() => note.undo && note.spot && void commit(note.goal, note.undo, note.spot)}>
            Undo
          </button>
        )}
        <button type="button" className="linkbtn" aria-label="Close" onClick={() => setNote(null)}>
          ×
        </button>
      </div>
    );
  };

  // Rule 10b: no Priority title rows. Each top goal is one row with its own number, counted down the list across the Backlog line.
  let ri = 0;
  const group = (p: PriorityRow, isFunded: boolean) => (
    <div className="group" key={p.id} data-gpid={p.id} data-focus={encodeFocus({ kind: "priority", id: p.id, label: p.title })}>
      {p.goals.map((g) => {
        const at = ri++;
        return goal(g, filtering ? undefined : at + 1, undefined, undefined, undefined, null, p.id, { ri: at, funded: isFunded });
      })}
      {!p.goals.length && (() => {
        const at = ri++;
        return (
          <div className={`row note${over?.row === `p:${at}` ? ` drop${over.edge}` : ""}`} data-ri={at} data-side={isFunded ? "funded" : "backlog"}>
            <div className="left">
              <Rank rank={at + 1} />
              <span className="title muted">{p.title} · No goals yet</span>
            </div>
            {blank}
          </div>
        );
      })()}
    </div>
  );
  const fundedRows = funded.map((p) => group(p, true));
  const backlogRows = backlog.map((p) => group(p, false));
  const toCut = over && !over.row && over.spot.kind === "rank";
  return (
    <>
      {fundedRows}
      {filtering && !funded.length && !backlog.length && <Note text="No goals match." blank={blank} />}
      {!filtering && !funded.length && <Note text="No ranked goals yet." blank={blank} />}
      {/* The cut line (SPEC.md §6.3), named Backlog on screen (Chelsea, 2026-11-06). A goal dropped on it goes to the top of Backlog. */}
      <div className={`cut${toCut ? " droptop" : ""}`}>
        <span>Backlog</span>
      </div>
      {backlogRows.length ? backlogRows : !filtering && <Note text="No goals in Backlog." blank={blank} />}
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
        <div className={`group nonegroup${over && !over.row && over.spot.kind === "none" ? " droptop" : ""}`} data-gpid="none" data-focus={encodeFocus({ kind: "section", id: "No priority", label: "No priority" })}>
          <div className="row d0 phead nonehead" style={{ "--depth": 0 } as CSSProperties}>
            <div className="left">
              <Rank />
              <span className="title">No priority</span>
              <span className="slot" />
            </div>
            {blank}
          </div>
          {props.none.map((g) => goal(g, undefined, undefined, undefined, undefined, null, null))}
          {!props.none.length && <Note text={props.arrange ? "Not ranked. Drag a goal here to take its number away." : "Every goal is ranked."} blank={blank} />}
        </div>
      )}
    </>
  );
}
