/**
 * Rule 35b: arranging goals on Home. A goal is dragged into another goal (it becomes a sub-goal), beside a sub-goal (a sub-goal of the same parent),
 * onto a Priority as a top goal, or to No priority. One move writes `priority` and `parent` with a reason. The server checks every rule.
 */

/** Where a dragged goal lands. `priority: null` is No priority. */
export type Spot = { kind: "into"; goal: string } | { kind: "beside"; parent: string } | { kind: "top"; priority: string | null };

/** A row under the pointer: its goal, that goal's parent, and the group it sits in (a Priority's id, or null for No priority). */
export type RowAt = { goal: string; parent: string | null; group: string | null };

type Tree = { id: string; children: Tree[] };

/** The fields a move to `spot` writes. A sub-goal takes its parent's Priority, so it holds none of its own. */
export function moveFields(spot: Spot): { priority: string | null; parent: string | null } {
  if (spot.kind === "into") return { priority: null, parent: spot.goal };
  if (spot.kind === "beside") return { priority: null, parent: spot.parent };
  return { priority: spot.priority, parent: null };
}

/** True when the move writes something new. A drop where the goal already is, is no move. */
export function changes(now: { priority: string | null; parent: string | null }, spot: Spot): boolean {
  const next = moveFields(spot);
  return next.priority !== now.priority || next.parent !== now.parent;
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
  if (spot.kind === "top") return true;
  const parent = spot.kind === "into" ? spot.goal : spot.parent;
  return !treeOf(trees, goal).has(parent);
}

/** The middle half of a row nests the goal into it. The top and bottom quarters place it beside the row. */
export function zoneOf(y: number, top: number, height: number): "in" | "edge" {
  const at = (y - top) / height;
  return at > 0.25 && at < 0.75 ? "in" : "edge";
}

/** The spot for a row and the zone the pointer is in. Beside a top goal is that group; beside a sub-goal is under the same parent. */
export function spotAt(row: RowAt, zone: "in" | "edge"): Spot {
  if (zone === "in") return { kind: "into", goal: row.goal };
  return row.parent ? { kind: "beside", parent: row.parent } : { kind: "top", priority: row.group };
}

/** The move in words, for the line that asks for its reason. */
export function moveWords(spot: Spot, names: { goal: (id: string) => string; priority: (id: string) => string }): string {
  if (spot.kind === "into") return `Make it a sub-goal of ${names.goal(spot.goal)}`;
  if (spot.kind === "beside") return `Make it a sub-goal of ${names.goal(spot.parent)}`;
  return spot.priority ? `Move it to ${names.priority(spot.priority)}` : "Move it to No priority";
}

/** Arrow up or down on a top goal's grip: the next group, Priorities in rank order then No priority. At an end it stays. */
export function nextGroup(groups: (string | null)[], from: string | null, by: -1 | 1): string | null {
  const at = groups.indexOf(from);
  return groups[Math.max(0, Math.min(groups.length - 1, at + by))];
}
