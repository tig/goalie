import type { CommandsRequest, GoalFields, Health, PathToGreen, StoredGoal } from "../../../src/api.ts";

/**
 * The goal page's panels as batches for POST /api/commands (docs/engineering/goal-page-and-create.md, Edits from the goal page).
 * Each panel is one update with base_version from the goal it read; a Fantasy promotion is a milestone create, then the update. The server checks every rule.
 */

const update = (goal: Pick<StoredGoal, "id" | "version">, fields: Partial<GoalFields>, reason: string): CommandsRequest => ({
  commands: [{ op: "update", kind: "goal", id: goal.id, base_version: goal.version, fields, reason }],
});

/** Health, with its Path to Green. A return to GREEN sends no Path to Green; the Event keeps the old one in the history (§6.1). */
export function healthBatch(goal: StoredGoal, health: Exclude<Health, null>, ptg: PathToGreen | null, reason: string): CommandsRequest {
  return update(goal, { health, path_to_green: health === "GREEN" ? null : ptg }, reason);
}

/** Record a slip (G13): the changed due date, with health and the Path to Green, in one save. The original committed date does not move. */
export function slipBatch(goal: StoredGoal, changedDueDate: string, health: Exclude<Health, null>, ptg: PathToGreen | null, reason: string): CommandsRequest {
  return update(goal, { changed_due_date: changedDueDate, health, path_to_green: health === "GREEN" ? null : ptg }, reason);
}

export type NewMilestone = { summary: string; due_date: string; owner: string };

/**
 * Promote date (G14). Fantasy to Ambition makes the next Promotion Milestone first ($m), then points the goal at it.
 * Ambition to Committed drops the milestone. The new date is sent only when it differs.
 */
export function promoteBatch(goal: StoredGoal, milestone: NewMilestone | null, newDate: string, reason: string): CommandsRequest {
  const date = newDate !== goal.due_date ? { due_date: newDate } : {};
  if (goal.date_type === "Fantasy" && milestone) {
    return {
      commands: [
        { op: "create", kind: "goal", ref: "$m", fields: { ...milestone, type: "Milestone (Commit)", date_type: "Committed", org_unit: goal.org_unit, level: goal.level }, reason },
        { op: "update", kind: "goal", id: goal.id, base_version: goal.version, fields: { date_type: "Ambition", promotion_milestone: "$m", ...date }, reason },
      ],
    };
  }
  return update(goal, { date_type: "Committed", promotion_milestone: null, ...date }, reason);
}

/** Close goal (G15): the state the close records, with a reason. */
export const closeBatch = (goal: StoredGoal, state: StoredGoal["state"], reason: string) => update(goal, { state }, reason);

/** Pursue (G16): a Backlog goal moves to In Progress with a health. */
export const pursueBatch = (goal: StoredGoal, health: Exclude<Health, null>, reason: string) => update(goal, { state: "In Progress", health }, reason);

/** The Fields or Description panel: only the fields that changed. */
export function fieldsBatch(goal: StoredGoal, edited: Partial<GoalFields>, reason: string): CommandsRequest {
  const changed = Object.fromEntries(
    Object.entries(edited).filter(([key, value]) => key in goal && JSON.stringify(value) !== JSON.stringify(goal[key as keyof StoredGoal])),
  ) as Partial<GoalFields>;
  return update(goal, changed, reason);
}

/** A comment is one Event (E-4). Its text is trimmed. */
export function commentBatch(kind: "goal" | "work_item", id: string, text: string): CommandsRequest {
  return { commands: [{ op: "comment", kind, id, text: text.trim() }] };
}

/**
 * After a stale save (409): the panel keeps the typed values, shows the current value of each field it changed, and saves again against the current version.
 */
export function staleMerge(typed: Record<string, unknown>, current: { version: number } & Record<string, unknown>): { base_version: number; current: Record<string, unknown> } {
  return { base_version: current.version, current: Object.fromEntries(Object.keys(typed).map((k) => [k, current[k]])) };
}
