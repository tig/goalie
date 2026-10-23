import type { ApiGoal, ApiPriority } from "../../../src/api.ts";
import type { Filter } from "./query.ts";

/** Health filter and search over the goal tree. The server sends every goal; the app chooses what to draw. */

export type GoalRow = Omit<ApiGoal, "children"> & {
  depth: number;
  /** False when a filter is on and this goal is drawn only as the parent of one that matches. */
  match: boolean;
  children: GoalRow[];
};

export type PriorityRow = Omit<ApiPriority, "goals"> & { goals: GoalRow[] };

export const isFiltering = (filter: Filter) => Boolean(filter.health || filter.q);

/** Each Priority with its goals marked. With a filter on, a goal stays when it matches or holds one that does, and a Priority with no goal left goes. */
export function filterPriorities(priorities: ApiPriority[], filter: Filter): PriorityRow[] {
  const needle = filter.q?.toLowerCase();
  const matches = (goal: ApiGoal) => (!filter.health || goal.health === filter.health) && (!needle || goal.summary.toLowerCase().includes(needle));
  const row = (goal: ApiGoal, depth: number): GoalRow | undefined => {
    const children = goal.children.map((c) => row(c, depth + 1)).filter((c): c is GoalRow => c !== undefined);
    const match = matches(goal);
    return match || children.length || !isFiltering(filter) ? { ...goal, depth, match, children } : undefined;
  };
  return priorities
    .map((p) => ({ ...p, goals: p.goals.map((g) => row(g, 0)).filter((g): g is GoalRow => g !== undefined) }))
    .filter((p) => !isFiltering(filter) || p.goals.length > 0);
}

/** Every goal in the trees, depth first. */
export function flatten<T extends { children: T[] }>(goals: T[]): T[] {
  return goals.flatMap((g) => [g, ...flatten(g.children)]);
}
