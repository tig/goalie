import type { ApiGoal, ApiPriority, GoalDate, Health } from "../../../src/api.ts";
import type { Filter } from "./query.ts";

/** Health filter and search over the goal tree. The server sends every goal; the app chooses what to draw. */

export type GoalRow = Omit<ApiGoal, "children"> & {
  depth: number;
  /** False when a filter is on and this goal is drawn only as the parent of one that matches. */
  match: boolean;
  /** The dates a sub-goal shares with its parent, when it has none of its own. Empty for a goal with its own dates. */
  inherited: GoalDate[];
  children: GoalRow[];
};

export type PriorityRow = Omit<ApiPriority, "goals"> & { goals: GoalRow[] };

export const isFiltering = (filter: Filter) => Boolean(filter.health || filter.q);

/**
 * Each Priority with its goals marked. A health filter selects what its count counts: the goals the server marks `counted` (plan E-9). Search matches any goal's summary.
 * With a filter on, a goal stays when it matches or holds one that does, and a Priority with no goal left goes.
 */
export function filterPriorities(priorities: ApiPriority[], filter: Filter): PriorityRow[] {
  const needle = filter.q?.toLowerCase();
  const row = (goal: ApiGoal, depth: number, from: GoalDate[]): GoalRow | undefined => {
    const inherited = goal.dates.length ? [] : from;
    const own = goal.dates.length ? goal.dates : from;
    const match = (!filter.health || (goal.counted && goal.health === filter.health)) && (!needle || goal.summary.toLowerCase().includes(needle));
    const children = goal.children.map((c) => row(c, depth + 1, own)).filter((c): c is GoalRow => c !== undefined);
    return match || children.length || !isFiltering(filter) ? { ...goal, depth, match, inherited, children } : undefined;
  };
  return priorities
    .map((p) => ({ ...p, goals: p.goals.map((g) => row(g, 0, [])).filter((g): g is GoalRow => g !== undefined) }))
    .filter((p) => !isFiltering(filter) || p.goals.length > 0);
}

/** Highlighted (rule H2) or selected (rule H3): a goal the Committed dates card counts, with the health pointed at or filtered on. */
export function isLit(goal: Pick<GoalRow, "counted" | "health" | "match">, lit: { selected?: Health; hot?: Health }): boolean {
  if (!goal.counted) return false;
  return Boolean((lit.selected && goal.match && goal.health === lit.selected) || (lit.hot !== undefined && goal.health === lit.hot));
}

/** Every goal in the trees, depth first. */
export function flatten<T extends { children: T[] }>(goals: T[]): T[] {
  return goals.flatMap((g) => [g, ...flatten(g.children)]);
}
