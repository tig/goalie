import type { ApiGoal, ApiPriority, GoalDate, PrioritiesResponse } from "../../../src/api.ts";

/** One goal found in the Priorities view: the Priority it serves, its parent, and its dates, its own or its parent's (rule 15). */
export type FoundGoal = {
  goal: ApiGoal;
  priority?: ApiPriority;
  parent?: ApiGoal;
  /** True above the cut line. */
  funded: boolean;
  dates: { own: GoalDate[]; inherited: GoalDate[] };
};

/** The goal with this key, or null. */
export function findGoal(data: Pick<PrioritiesResponse, "funded" | "backlog">, key: string): FoundGoal | null {
  const search = (goals: ApiGoal[], priority: ApiPriority, funded: boolean, parent?: ApiGoal, inherited: GoalDate[] = []): FoundGoal | null => {
    for (const goal of goals) {
      const dates = goal.dates.length ? [] : inherited;
      if (goal.id === key) return { goal, priority, parent, funded, dates: { own: goal.dates, inherited: dates } };
      const found = search(goal.children, priority, funded, goal, goal.dates.length ? goal.dates : inherited);
      if (found) return found;
    }
    return null;
  };
  for (const [list, funded] of [[data.funded, true], [data.backlog, false]] as const) {
    for (const priority of list) {
      const found = search(priority.goals, priority, funded);
      if (found) return found;
    }
  }
  return null;
}
