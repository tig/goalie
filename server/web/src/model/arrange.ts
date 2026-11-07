import type { CommandsRequest } from "../../../src/api.ts";

/**
 * Rule 35b: arranging goals on Home. Each top goal on a Priority shows a number: its place in one list, 1 to n. There is no Priority title on Home.
 * A goal is dragged between numbered goals (it takes that number, and the numbers after it move down), into another goal (it becomes a sub-goal),
 * beside a sub-goal (a sub-goal of the same parent), or to No priority. The numbered goals below the cut line (SPEC.md §6.3) show under Backlog.
 * A goal goes in or out of the Backlog only when it is dropped there; a move inside one part keeps the line where it is. The server checks every rule.
 */

/** Where a dragged goal lands. `at` gives it the number `number`, above the cut line or in the Backlog. */
export type Spot = { kind: "into"; goal: string } | { kind: "beside"; parent: string } | { kind: "at"; number: number; backlog: boolean } | { kind: "none" };

/** Where a goal is now: its place in the numbered list (null when it is not numbered), whether that place is in the Backlog, and its parent. */
export type Place = { index: number | null; backlog: boolean; parent: string | null };

/** A row under the pointer: its goal, that goal's parent, its place in the numbered list (null for a sub-goal or a goal with no priority), and whether it is in the Backlog. */
export type RowAt = { goal: string; parent: string | null; index: number | null; backlog: boolean };

type Tree = { id: string; children: Tree[] };

/** The list after `goal` moves to `at`. A goal not in the list joins it; `at` counts places in the list as it is now. */
export function placed(ids: string[], goal: string, at: number): string[] {
  const from = ids.indexOf(goal);
  const rest = ids.filter((id) => id !== goal);
  rest.splice(from >= 0 && at > from ? at - 1 : at, 0, goal);
  return rest;
}

/** The numbered goals above the cut line once `goal` leaves its place. `split` is how many there are now. */
const above = (ids: string[], split: number, goal: string) => ids.slice(0, split).filter((id) => id !== goal).length;

/** The fields a move off the numbered list writes. A sub-goal takes its parent's Priority, so it holds none of its own. */
export function moveFields(spot: Exclude<Spot, { kind: "at" }>): { priority: null; parent: string | null } {
  if (spot.kind === "into") return { priority: null, parent: spot.goal };
  if (spot.kind === "beside") return { priority: null, parent: spot.parent };
  return { priority: null, parent: null };
}

/** True when the move changes something. A drop where the goal already is, is no move. */
export function changes(now: Place, spot: Spot): boolean {
  if (spot.kind === "into") return now.parent !== spot.goal;
  if (spot.kind === "beside") return now.parent !== spot.parent;
  if (spot.kind === "none") return now.index !== null || now.parent !== null;
  return now.index === null || spot.number - 1 !== now.index || spot.backlog !== now.backlog;
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

/** A goal never goes into itself or under a goal of its own tree. The last goal above the cut line does not go to the Backlog, so the line always has a goal above it. */
export function canMove(trees: Tree[], goal: string, spot: Spot, ids: string[] = [], split = ids.length): boolean {
  if (spot.kind === "at") return !spot.backlog || above(ids, split, goal) > 0;
  if (spot.kind === "none") return true;
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

/** The spot for a row, the zone, and the edge the pointer is on. `ids` is the numbered list and `goal` the goal being moved. A drop beside a row keeps that row's part of the list. */
export function spotAt(row: RowAt, zone: "in" | "edge", edge: "before" | "after", ids: string[], goal: string): Spot {
  if (zone === "in") return { kind: "into", goal: row.goal };
  if (row.parent) return { kind: "beside", parent: row.parent };
  if (row.index === null) return { kind: "none" };
  const index = edge === "before" ? row.index : row.index + 1;
  return { kind: "at", number: placed(ids, goal, index).indexOf(goal) + 1, backlog: row.backlog };
}

/** A drop on the Backlog heading: the first place in the Backlog. */
export const backlogTop = (ids: string[], split: number, goal: string): Spot => ({ kind: "at", number: above(ids, split, goal) + 1, backlog: true });

/**
 * Arrow up or down on a top goal's grip: one step. The steps run 1 to the last number above the cut line, then, when there is a Backlog, its first place (the same number), then on to the end.
 * Down from the end goes to No priority; up from No priority takes the end. `from` is where the goal is in the steps now.
 */
export function nextSpot(ids: string[], split: number, goal: string, from: Spot, by: -1 | 1): Spot | null {
  const f = above(ids, split, goal);
  const n = ids.filter((id) => id !== goal).length;
  const steps: Spot[] = [...Array.from({ length: f + 1 }, (_, i): Spot => ({ kind: "at", number: i + 1, backlog: false })), ...Array.from({ length: n - f + 1 }, (_, i): Spot => ({ kind: "at", number: f + i + 1, backlog: true }))];
  // With no Backlog the steps end above the cut line: a drop on the Backlog starts one. The last goal above the line does not step into the Backlog.
  const ends = ids.length > split && f > 0 ? steps : steps.slice(0, f + 1);
  const at = from.kind === "at" ? ends.findIndex((s) => s.kind === "at" && s.number === from.number && s.backlog === from.backlog) : from.kind === "none" ? ends.length : -1;
  if (at < 0) return null;
  const next = at + by;
  if (next === ends.length) return { kind: "none" };
  if (next < 0 || next > ends.length) return null;
  return ends[next];
}

/** The move in words, while it is chosen. */
export function moveWords(spot: Spot, names: { goal: (id: string) => string }): string {
  if (spot.kind === "into") return `Make it a sub-goal of ${names.goal(spot.goal)}`;
  if (spot.kind === "beside") return `Make it a sub-goal of ${names.goal(spot.parent)}`;
  if (spot.kind === "at") return spot.backlog ? `Move it to the Backlog as number ${spot.number}` : `Make it number ${spot.number}`;
  return "Move it to No priority";
}

/** What a saved move did, said after the goal's name. */
export function movedWords(spot: Spot, names: { goal: (id: string) => string }): string {
  if (spot.kind === "into") return `is now a sub-goal of ${names.goal(spot.goal)}.`;
  if (spot.kind === "beside") return `is now a sub-goal of ${names.goal(spot.parent)}.`;
  if (spot.kind === "at") return spot.backlog ? `is now number ${spot.number}, in the Backlog.` : `is now number ${spot.number}.`;
  return "now has no priority.";
}

type ListPriority = { id: string; version: number; rank: number; cut_line: boolean; status?: string; goals: { id: string; version: number; summary: string }[] };

/**
 * One batch that moves `goal` to `spot` and ranks the list 1 to n (SPEC.md §6.3: ranks 1 to n, no tie).
 * `priorities` is every current Priority of the list in rank order, with its top goals; `split` is how many numbered goals are above the cut line now.
 * The batch writes no goal but the moved one, since the list's owner may not change another owner's goal (owners-change-goal).
 * So the goals of one Priority move as one block: a goal dropped inside a block lands after it. The moved goal keeps its Priority when it held it alone, else gets a new one titled with its summary.
 * A Priority that the moved goal held alone, and leaves, retires. Any other Priority with no goal keeps a rank after the numbered goals, so no rank is skipped.
 * The cut line is on the Priority of the last block above it, and on none when the Backlog is empty.
 */
export function arrangeBatch(
  priorities: ListPriority[],
  goal: { id: string; version: number; summary: string },
  spot: Spot,
  split: number,
  list: { org_unit: string; period: string },
  reason: string,
): CommandsRequest {
  const ids = priorities.flatMap((p) => p.goals.map((g) => g.id));
  const above = new Set(ids.slice(0, split));
  const own = priorities.find((p) => p.goals.some((g) => g.id === goal.id));
  const alone = own !== undefined && own.goals.length === 1;
  type Block = { p: ListPriority | null; funded: boolean; size: number };
  const blocks: Block[] = priorities
    .map((p) => ({ p, funded: p.goals.some((g) => above.has(g.id)), size: p.goals.filter((g) => g.id !== goal.id).length }))
    .filter((b) => b.size > 0);
  if (spot.kind === "at") {
    const moved: Block = { p: alone ? own : null, funded: !spot.backlog, size: 1 };
    // The first block boundary at or after the place the goal was dropped, kept inside its part of the list.
    let at = 0;
    for (let seen = 0; at < blocks.length && seen < spot.number - 1; at++) seen += blocks[at].size;
    const firstBelow = blocks.findIndex((b) => !b.funded);
    const line = firstBelow < 0 ? blocks.length : firstBelow;
    at = spot.backlog ? Math.max(at, line) : Math.min(at, line);
    blocks.splice(at, 0, moved);
  }
  const lastAbove = blocks.map((b) => b.funded).lastIndexOf(true);
  const cutAt = lastAbove >= 0 && lastAbove < blocks.length - 1 ? lastAbove : -1;
  const ranks: CommandsRequest["commands"] = [];
  const made: CommandsRequest["commands"] = [];
  const update = (p: ListPriority, fields: { rank?: number; cut_line?: boolean; status?: "Retired" }) => {
    const changed = Object.fromEntries(Object.entries(fields).filter(([k, v]) => p[k as keyof ListPriority] !== v));
    if (Object.keys(changed).length) ranks.push({ op: "update", kind: "priority", id: p.id, base_version: p.version, fields: changed, reason });
  };
  blocks.forEach((b, i) => {
    if (b.p) return update(b.p, { rank: i + 1, cut_line: i === cutAt });
    const ref = `$p${i + 1}` as const;
    made.push({ op: "create", kind: "priority", ref, fields: { ...list, rank: i + 1, title: goal.summary, ...(i === cutAt ? { cut_line: true } : {}) }, reason });
    made.push({ op: "update", kind: "goal", id: goal.id, base_version: goal.version, fields: { priority: ref, parent: null }, reason });
  });
  const placed = new Set(blocks.flatMap((b) => (b.p ? [b.p.id] : [])));
  priorities.filter((p) => !placed.has(p.id) && !(alone && p.id === own.id)).forEach((p, i) => update(p, { rank: blocks.length + i + 1, cut_line: false }));
  if (alone && !placed.has(own.id)) update(own, { status: "Retired", cut_line: false });
  // A move off the list writes the goal first, so its Priority is empty when it retires.
  const off: CommandsRequest["commands"] = spot.kind === "at" ? [] : [{ op: "update", kind: "goal", id: goal.id, base_version: goal.version, fields: moveFields(spot), reason }];
  return { commands: [...off, ...ranks, ...made] };
}

/** The plan period of a day, as the seed writes it: "2026-Q4". A new Priority takes the list's period, or this one when the list is empty. */
export const quarterOf = (today: string) => `${today.slice(0, 4)}-Q${Math.floor((Number(today.slice(5, 7)) - 1) / 3) + 1}`;
