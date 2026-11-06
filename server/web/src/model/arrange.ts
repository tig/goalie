import type { ApiCommand, CommandsRequest } from "../../../src/api.ts";

/**
 * Rule 35b: Home is one ranked list of goals. Each top goal is its own Priority, so its number is that Priority's rank (SPEC.md §6.3).
 * A goal is dragged to a new number, below the Backlog line, into another goal (a sub-goal), beside a sub-goal, or to No priority.
 * One move is one batch with a reason the app writes. The server checks every rule.
 */

/**
 * Where a dragged goal lands. `rank` is its place among the top rows once it is there, counted from 0, above the line (`funded`) or below it.
 * `none` is No priority.
 */
export type Spot = { kind: "into"; goal: string } | { kind: "beside"; parent: string } | { kind: "rank"; index: number; funded: boolean } | { kind: "none" };

/** One top row on Home, in order: the funded rows, then the Backlog rows. A Priority with no goal is a row with `goal: null`. */
export type Slot = { goal: string | null; priority: string; funded: boolean };

/** A Priority of the list, as the batch needs it. */
export type Listed = { id: string; version: number; rank: number; cutLine: boolean };

/** The goal being moved, as it is now. */
export type Mover = { id: string; version: number; summary: string; priority: string | null; parent: string | null };

type Tree = { id: string; children: Tree[] };

/** The ref a Priority made in the batch takes. */
const MADE = "$p";

/** Home's top rows in order: each funded Priority's top goals, then Backlog's. A Priority with no goal is one row with no goal. */
export function slotsOf(funded: { id: string; goals: { id: string }[] }[], backlog: { id: string; goals: { id: string }[] }[]): Slot[] {
  const rows = (list: typeof funded, side: boolean) =>
    list.flatMap((p): Slot[] => (p.goals.length ? p.goals.map((g) => ({ goal: g.id, priority: p.id, funded: side })) : [{ goal: null, priority: p.id, funded: side }]));
  return [...rows(funded, true), ...rows(backlog, false)];
}

/** True when the goal is a top row that holds its Priority alone, so the goal and the Priority move as one. */
export function holdsAlone(slots: Slot[], goal: string): boolean {
  const own = slots.find((s) => s.goal === goal);
  return own !== undefined && slots.filter((s) => s.priority === own.priority).length === 1;
}

/** The fields a move writes on the goal. A sub-goal takes its parent's Priority, so it holds none of its own. */
function goalFields(spot: Exclude<Spot, { kind: "rank" }>): { priority: null; parent: string | null } {
  if (spot.kind === "into") return { priority: null, parent: spot.goal };
  if (spot.kind === "beside") return { priority: null, parent: spot.parent };
  return { priority: null, parent: null };
}

/** The Priorities in their new order, split by the line. A Priority shared by several goals keeps its first place. */
function sides(rows: Slot[]): { funded: string[]; backlog: string[] } {
  const seen = new Set<string>();
  const funded: string[] = [];
  const backlog: string[] = [];
  for (const row of rows) {
    if (seen.has(row.priority)) continue;
    seen.add(row.priority);
    (row.funded ? funded : backlog).push(row.priority);
  }
  return { funded, backlog };
}

/**
 * The updates that give the Priorities their new ranks and put the cut line under the last funded one.
 * Null when nothing would be left above the line while something is below it.
 */
function relist(rows: Slot[], listed: Listed[], reason: string, made?: { title: string; orgUnit: string; period: string }): ApiCommand[] | null {
  const { funded, backlog } = sides(rows);
  if (!funded.length && backlog.length) return null;
  const holder = backlog.length || listed.some((p) => p.cutLine) ? funded[funded.length - 1] : undefined;
  return [...funded, ...backlog].flatMap((id, i): ApiCommand[] => {
    const rank = i + 1;
    if (id === MADE && made) {
      return [{ op: "create", kind: "priority", ref: MADE, fields: { org_unit: made.orgUnit, period: made.period, rank, title: made.title, ...(holder === MADE ? { cut_line: true } : {}) }, reason }];
    }
    const p = listed.find((x) => x.id === id);
    if (!p) return [];
    const fields: { rank?: number; cut_line?: boolean } = {};
    if (p.rank !== rank) fields.rank = rank;
    if (p.cutLine !== (holder === id)) fields.cut_line = holder === id;
    return Object.keys(fields).length ? [{ op: "update", kind: "priority", id, base_version: p.version, fields, reason }] : [];
  });
}

/** Put a row at a place among the rows. Above the line a place is at most the count of funded rows; below it, at least that. */
function insert(rest: Slot[], row: Slot, index: number): Slot[] {
  const funded = rest.filter((s) => s.funded).length;
  const at = row.funded ? Math.min(index, funded) : Math.max(index, funded);
  return [...rest.slice(0, at), row, ...rest.slice(at)];
}

/**
 * The batch for one move, or null when the move changes nothing or would leave nothing above the line.
 * A goal that holds its Priority alone moves with it. Any other goal dropped into the list gets a Priority of its own, titled with its summary.
 * A goal that leaves a Priority it held alone retires that Priority, and the rest close the gap.
 */
export function moveBatch(slots: Slot[], listed: Listed[], goal: Mover, spot: Spot, ctx: { orgUnit: string; period: string }, reason: string): CommandsRequest | null {
  const alone = holdsAlone(slots, goal.id);
  const rest = slots.filter((s) => s.goal !== goal.id);
  if (spot.kind === "rank") {
    const priority = alone ? (slots.find((s) => s.goal === goal.id) as Slot).priority : MADE;
    const rows = insert(rest, { goal: goal.id, priority, funded: spot.funded }, spot.index);
    const ranked = relist(rows, listed, reason, alone ? undefined : { title: goal.summary, orgUnit: ctx.orgUnit, period: ctx.period });
    if (!ranked || !ranked.length) return null;
    const placed: ApiCommand[] = alone ? [] : [{ op: "update", kind: "goal", id: goal.id, base_version: goal.version, fields: { priority: MADE, parent: null }, reason }];
    return { commands: [...ranked, ...placed] };
  }
  const fields = goalFields(spot);
  if (!alone && fields.parent === goal.parent && goal.priority === null) return null;
  const moved: ApiCommand = { op: "update", kind: "goal", id: goal.id, base_version: goal.version, fields, reason };
  if (!alone) return { commands: [moved] };
  const own = (slots.find((s) => s.goal === goal.id) as Slot).priority;
  const p = listed.find((x) => x.id === own);
  const ranked = relist(rest, listed.filter((x) => x.id !== own), reason);
  if (!ranked || !p) return null;
  return { commands: [moved, { op: "update", kind: "priority", id: own, base_version: p.version, fields: { status: "Retired", ...(p.cutLine ? { cut_line: false } : {}) }, reason }, ...ranked] };
}

/**
 * Who may make a move. A number is a Priority's rank, so changing it needs the right to rank (SPEC.md §6.3).
 * Nesting a goal needs the right on the goal, and on its Priority too when the goal holds it alone, since that Priority retires.
 * A goal that does not hold its Priority alone also needs the right on the goal to take a Priority of its own.
 */
export function mayMove(may: { rank: boolean; goal: boolean }, alone: boolean, spot: Spot): boolean {
  if (spot.kind === "rank") return may.rank && (alone || may.goal);
  return may.goal && (!alone || may.rank);
}

/** The goal and every goal under it. */
function treeOf(trees: Tree[], id: string): Set<string> {
  const find = (list: Tree[]): Tree | undefined => {
    for (const t of list) {
      if (t.id === id) return t;
      const hit = find(t.children);
      if (hit) return hit;
    }
    return undefined;
  };
  const out = new Set<string>();
  const walk = (t: Tree) => {
    out.add(t.id);
    t.children.forEach(walk);
  };
  const root = find(trees);
  if (root) walk(root);
  else out.add(id);
  return out;
}

/** A goal never goes into itself or under a goal of its own tree. */
export function canMove(trees: Tree[], goal: string, spot: Spot): boolean {
  if (spot.kind === "rank" || spot.kind === "none") return true;
  const parent = spot.kind === "into" ? spot.goal : spot.parent;
  return !treeOf(trees, goal).has(parent);
}

/** The middle half of a row nests the goal into it. The top and bottom quarters place it beside the row. */
export function zoneOf(y: number, top: number, height: number): "in" | "edge" {
  const at = (y - top) / height;
  return at > 0.25 && at < 0.75 ? "in" : "edge";
}

/** On a row's edge, whether the drop line shows above the row or below it. */
export function edgeOf(y: number, top: number, height: number): "before" | "after" {
  return y - top < height / 2 ? "before" : "after";
}

/** The place an edge of top row `row` marks. `from` is the moving goal's row, or -1 when it is not a top row; rows after it move up one. */
export function rankSpot(row: number, edge: "before" | "after", funded: boolean, from: number): Spot {
  const at = edge === "before" ? row : row + 1;
  return { kind: "rank", index: from >= 0 && from < at ? at - 1 : at, funded };
}

/** The move in words, for the label while dragging and the line that waits for Enter. */
export function moveWords(spot: Spot, names: { goal: (id: string) => string }): string {
  if (spot.kind === "into") return `Make it a sub-goal of ${names.goal(spot.goal)}`;
  if (spot.kind === "beside") return `Make it a sub-goal of ${names.goal(spot.parent)}`;
  if (spot.kind === "rank") return spot.funded ? `Move it to number ${spot.index + 1}` : `Move it to Backlog, number ${spot.index + 1}`;
  return "Move it to No priority";
}

/** What a saved move did, said after the goal's name: "is now number 2.", "is now number 4, in Backlog.", "is now a sub-goal of …", "now has no priority." */
export function movedWords(spot: Spot, names: { goal: (id: string) => string }): string {
  if (spot.kind === "into") return `is now a sub-goal of ${names.goal(spot.goal)}.`;
  if (spot.kind === "beside") return `is now a sub-goal of ${names.goal(spot.parent)}.`;
  if (spot.kind === "rank") return spot.funded ? `is now number ${spot.index + 1}.` : `is now number ${spot.index + 1}, in Backlog.`;
  return "now has no priority.";
}

/** Every place a goal can go with the keyboard, top to bottom: each number above the line, each below it, then No priority. */
export function places(slots: Slot[], goal: string): Spot[] {
  const rest = slots.filter((s) => s.goal !== goal);
  const funded = rest.filter((s) => s.funded).length;
  const above = Array.from({ length: funded + 1 }, (_, i): Spot => ({ kind: "rank", index: i, funded: true }));
  const below = Array.from({ length: rest.length - funded + 1 }, (_, i): Spot => ({ kind: "rank", index: funded + i, funded: false }));
  return [...above, ...below, { kind: "none" }];
}

/** Where a goal is now, as a place: its row, or No priority. */
export function placeOf(slots: Slot[], goal: string): Spot {
  const at = slots.findIndex((s) => s.goal === goal);
  return at < 0 ? { kind: "none" } : { kind: "rank", index: at, funded: slots[at].funded };
}

const samePlace = (a: Spot, b: Spot) => JSON.stringify(a) === JSON.stringify(b);

/** Arrow up or down: the next place. At an end it stays. */
export function nextPlace(all: Spot[], from: Spot, by: -1 | 1): Spot {
  const at = all.findIndex((p) => samePlace(p, from));
  return all[Math.max(0, Math.min(all.length - 1, at + by))];
}
