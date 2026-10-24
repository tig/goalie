import type { Row } from "./rules.ts";

/**
 * The goal domain: each piece of goal knowledge has its one home here (SPEC.md §5, §6.1, §7).
 * rules.ts checks it, priorities.ts draws it.
 */

/** The Date Types (SPEC.md §5), from least to most firm. */
export const DATE_TYPES = ["Fantasy", "Ambition", "Committed"] as const;
export type DateType = (typeof DATE_TYPES)[number];

/** The states (SPEC.md §7.2). */
export const STATES = ["Backlog", "In Progress", "Completed", "Completed Late", "Did Not Meet", "Deleted"] as const;
export type State = (typeof STATES)[number];

/** States in which a goal is still open: not yet closed out. */
export const OPEN_STATES: readonly State[] = ["Backlog", "In Progress"];

/** States that need a Committed date (SPEC.md §7.2). */
export const COMPLETED_STATES: readonly State[] = ["Completed", "Completed Late"];

/** The moves the state lifecycle allows (SPEC.md §7.2). A closed state has none. */
export const STATE_MOVES: Record<State, readonly State[]> = {
  Backlog: ["In Progress", "Deleted"],
  "In Progress": ["Completed", "Completed Late", "Did Not Meet", "Deleted"],
  Completed: [],
  "Completed Late": [],
  "Did Not Meet": [],
  Deleted: [],
};

/** Visibility of a new goal (SPEC.md §6.1, §12). */
export const DEFAULT_VISIBILITY = "organization-wide";

export function isOpen(goal: Row): boolean {
  return (OPEN_STATES as readonly unknown[]).includes(goal.state);
}

/** The date a goal is judged against: the changed date after a slip, else the due date. */
export function currentDate(goal: Row): string | undefined {
  const date = goal.changed_due_date ?? goal.due_date;
  return typeof date === "string" ? date : undefined;
}

export type CommittedDate = { date: string; kind: "Committed" | "Promotion Milestone" };

/** The committed date health is judged against (SPEC.md §6.1): its own, else its Promotion Milestone's. */
export function committedDate(goal: Row, getGoal: (id: string) => Row | undefined): CommittedDate | undefined {
  if (goal.date_type === "Committed") {
    const date = currentDate(goal);
    return date === undefined ? undefined : { date, kind: "Committed" };
  }
  const milestone = typeof goal.promotion_milestone === "string" ? getGoal(goal.promotion_milestone) : undefined;
  const date = milestone === undefined ? undefined : currentDate(milestone);
  return date === undefined ? undefined : { date, kind: "Promotion Milestone" };
}
