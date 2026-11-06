import type { CommandsRequest } from "../../../src/api.ts";

/**
 * Rule 35b: arranging goals on Home. Each top goal on a Priority shows a number: its place in one list, 1 to n. There is no Priority title on Home.
 * A goal is dragged between numbered goals (it takes that number, and the numbers after it move down), into another goal (it becomes a sub-goal),
 * beside a sub-goal (a sub-goal of the same parent), or to No priority. The server checks every rule.
 */

/** Where a dragged goal lands. `at` puts it before the numbered goal now at `index` (the list's length is the end); `number` is the number it then shows. */
export type Spot = { kind: "into"; goal: string } | { kind: "beside"; parent: string } | { kind: "at"; index: number; number: number } | { kind: "none" };

/** Where a goal is now: its place in the numbered list (null when it is not numbered) and its parent. */
export type Place = { index: number | null; parent: string | null };

/** A row under the pointer: its goal, that goal's parent, and its place in the numbered list (null for a sub-goal or a goal with no priority). */
export type RowAt = { goal: string; parent: string | null; index: number | null };

type Tree = { id: string; children: Tree[] };

/** The list after `goal` moves to `at`. A goal not in the list joins it; `at` counts places in the list as it is now. */
export function placed(ids: string[], goal: string, at: number): string[] {
  const from = ids.indexOf(goal);
  const rest = ids.filter((id) => id !== goal);
  rest.splice(from >= 0 && at > from ? at - 1 : at, 0, goal);
  return rest;
}

/** The `at` spot that gives `goal` the number `number` in the list `ids`. */
export function toNumber(ids: string[], goal: string, number: number): Spot {
  const from = ids.indexOf(goal);
  return { kind: "at", index: from >= 0 && from < number - 1 ? number : number - 1, number };
}

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
  return now.index === null || (spot.index !== now.index && spot.index !== now.index + 1);
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
  if (spot.kind === "at" || spot.kind === "none") return true;
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

/** The spot for a row, the zone, and the edge the pointer is on. `ids` is the numbered list and `goal` the goal being moved. */
export function spotAt(row: RowAt, zone: "in" | "edge", edge: "before" | "after", ids: string[], goal: string): Spot {
  if (zone === "in") return { kind: "into", goal: row.goal };
  if (row.parent) return { kind: "beside", parent: row.parent };
  if (row.index === null) return { kind: "none" };
  const index = edge === "before" ? row.index : row.index + 1;
  return { kind: "at", index, number: placed(ids, goal, index).indexOf(goal) + 1 };
}

/** Arrow up or down on a top goal's grip: one number up or down. Down from the last goes to No priority; up from No priority takes the last number. */
export function nextSpot(ids: string[], goal: string, by: -1 | 1): Spot | null {
  const at = ids.indexOf(goal);
  if (at < 0) return by === -1 ? toNumber(ids, goal, ids.length + 1) : null;
  if (by === 1 && at === ids.length - 1) return { kind: "none" };
  if (by === -1 && at === 0) return null;
  return toNumber(ids, goal, at + 1 + by);
}

/** The move in words, while it is chosen. */
export function moveWords(spot: Spot, names: { goal: (id: string) => string }): string {
  if (spot.kind === "into") return `Make it a sub-goal of ${names.goal(spot.goal)}`;
  if (spot.kind === "beside") return `Make it a sub-goal of ${names.goal(spot.parent)}`;
  if (spot.kind === "at") return `Make it number ${spot.number}`;
  return "Move it to No priority";
}

/** What a saved move did, said after the goal's name. */
export function movedWords(spot: Spot, names: { goal: (id: string) => string }): string {
  if (spot.kind === "into") return `is now a sub-goal of ${names.goal(spot.goal)}.`;
  if (spot.kind === "beside") return `is now a sub-goal of ${names.goal(spot.parent)}.`;
  if (spot.kind === "at") return `is now number ${spot.number}.`;
  return "now has no priority.";
}

type ListPriority = { id: string; version: number; rank: number; goals: { id: string; version: number; summary: string }[] };

/**
 * One batch that puts `goal` at `index` in the numbered list and numbers the list 1 to n (SPEC.md §6.3: ranks 1 to n, no tie).
 * `priorities` is every current Priority of the list in rank order, with its top goals. Each numbered goal keeps its Priority when it is that Priority's first goal;
 * any other gets a new Priority titled with its summary. A Priority with no goal keeps a rank after the numbered goals, so no rank is skipped.
 */
export function arrangeBatch(priorities: ListPriority[], goal: { id: string; version: number; summary: string }, index: number, list: { org_unit: string; period: string }, reason: string): CommandsRequest {
  const entries = priorities.flatMap((p) => p.goals.map((g) => ({ goal: g, priority: p })));
  const order = placed(
    entries.map((e) => e.goal.id),
    goal.id,
    index,
  );
  const claimed = new Set<string>();
  const ranks: CommandsRequest["commands"] = [];
  const made: CommandsRequest["commands"] = [];
  const rank = (p: ListPriority, to: number) => p.rank !== to && ranks.push({ op: "update", kind: "priority", id: p.id, base_version: p.version, fields: { rank: to }, reason });
  order.forEach((id, i) => {
    const entry = entries.find((e) => e.goal.id === id);
    if (entry && !claimed.has(entry.priority.id)) {
      claimed.add(entry.priority.id);
      rank(entry.priority, i + 1);
      return;
    }
    const g = entry?.goal ?? goal;
    const ref = `$p${i + 1}` as const;
    made.push({ op: "create", kind: "priority", ref, fields: { ...list, rank: i + 1, title: g.summary }, reason });
    made.push({ op: "update", kind: "goal", id: g.id, base_version: g.version, fields: { priority: ref, parent: null }, reason });
  });
  priorities.filter((p) => !claimed.has(p.id)).forEach((p, i) => rank(p, order.length + i + 1));
  return { commands: [...ranks, ...made] };
}

/** The plan period of a day, as the seed writes it: "2026-Q4". A new Priority takes the list's period, or this one when the list is empty. */
export const quarterOf = (today: string) => `${today.slice(0, 4)}-Q${Math.floor((Number(today.slice(5, 7)) - 1) / 3) + 1}`;
