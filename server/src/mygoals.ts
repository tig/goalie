import type { DatabaseSync } from "node:sqlite";
import type { GoalHit, GoalsResponse, Health, MyGoal, MyGoalsResponse } from "./api.ts";
import { goalDates, isOpen, resolvedGoal, type State } from "./goal.ts";
import { firstStep } from "./priorities.ts";
import { readAll } from "./read.ts";
import type { Row } from "./rules.ts";

/**
 * The My goals view and goal search (SPEC.md §8.2, #71).
 * A goal with no Priority is on no Priorities row, so these two are where it is found.
 */

/** The saved definition behind My goals. It selects by owner and state, not by Priority. */
const MY_GOALS_VIEW = {
  name: "My goals",
  columns: ["Summary", "Priority", "State", "Health", "Date Type", "Promotion Milestone", "PTG"],
} as const;

/** The default sort (SPEC.md §8.2): RED, YELLOW, GREEN, then a goal with no health. */
const HEALTH_ORDER: Health[] = ["RED", "YELLOW", "GREEN", null];

/** Every goal and actor, read once, with the Priority title each goal serves. */
function loaded(db: DatabaseSync) {
  const goals = new Map(readAll(db, "goal").map((g) => [g.id as string, g]));
  const titles = new Map(readAll(db, "priority").map((p) => [p.id as string, p.title as string]));
  const names = new Map(readAll(db, "actor").map((a) => [a.id as string, a.display_name as string]));
  const actor = (id: string) => ({ id, name: names.get(id) ?? id });
  /** The Priority a goal serves: its own, else its nearest parent's. */
  const priorityOf = (goal: Row): string | null => {
    const seen = new Set<unknown>();
    for (let at: Row | undefined = goal; at && !seen.has(at.id); at = typeof at.parent === "string" ? goals.get(at.parent) : undefined) {
      seen.add(at.id);
      if (typeof at.priority === "string") return titles.get(at.priority) ?? at.priority;
    }
    return null;
  };
  return { goals, actor, names, priorityOf };
}

/** My goals for `me` on `today`, the org's calendar day. */
export function myGoalsView(db: DatabaseSync, me: string, today: string): Omit<MyGoalsResponse, "me"> {
  const { goals, actor, names, priorityOf } = loaded(db);
  const getGoal = (id: string) => goals.get(id);
  const rows: MyGoal[] = [...goals.values()]
    .filter((g) => g.owner === me && isOpen(g))
    .map((g) => {
      const health = (g.health as Health) ?? null;
      // The PTG column shows the first step of the Path to Green, as Home does, for a goal that is not GREEN.
      const ptg = health === "RED" || health === "YELLOW" ? firstStep(g.path_to_green, names) : undefined;
      return {
        id: g.id as string,
        summary: g.summary as string,
        owner: actor(g.owner as string),
        state: g.state as State,
        health,
        dates: goalDates(resolvedGoal(g, getGoal), true, getGoal, today),
        priority: priorityOf(g),
        ...(ptg ? { ptg } : {}),
      };
    })
    .sort((a, b) => HEALTH_ORDER.indexOf(a.health) - HEALTH_ORDER.indexOf(b.health) || a.id.localeCompare(b.id));
  return { today, view: { name: MY_GOALS_VIEW.name, columns: MY_GOALS_VIEW.columns }, goals: rows };
}

/** Goal search: every goal whose key or summary holds `q`, any case, in key order. `q` is not blank. */
export function searchGoals(db: DatabaseSync, q: string): GoalsResponse {
  const { goals, actor, priorityOf } = loaded(db);
  const needle = q.toLowerCase();
  const hits: GoalHit[] = [...goals.values()]
    .filter((g) => String(g.id).toLowerCase().includes(needle) || String(g.summary).toLowerCase().includes(needle))
    .map((g) => ({ id: g.id as string, summary: g.summary as string, owner: actor(g.owner as string), state: g.state as State, health: (g.health as Health) ?? null, priority: priorityOf(g) }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return { goals: hits };
}
