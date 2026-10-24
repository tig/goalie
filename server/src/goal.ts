import type { GoalDate } from "./api.ts";
import { day, daysBetween } from "./dates.ts";
import type { Row } from "./rules.ts";

/**
 * The goal domain: each piece of goal knowledge has its one home here (SPEC.md §5, §6.1, §7).
 * rules.ts checks it, priorities.ts draws it.
 */

/** The Date Types (SPEC.md §5), from least to most firm. */
export const DATE_TYPES = ["Fantasy", "Ambition", "Committed"] as const;

/** The states (SPEC.md §7.2). */
export type State = "Backlog" | "In Progress" | "Completed" | "Completed Late" | "Did Not Meet" | "Deleted";

/** The goal type a Promotion Milestone has (SPEC.md §6.1 type). The one home: rules.ts checks it, and FormOptions sends it to the app. */
export const PROMOTION_MILESTONE_TYPE = "Milestone (Commit)";

/** Work-item status values (D8): SPEC.md §6.1 State words. The one home: rules.ts checks them, options.ts offers them. */
export const WORK_ITEM_STATUSES = ["Backlog", "In Progress", "Completed", "Deleted"] as const;

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

/** The fields a sub-goal with no date of its own takes from its parent (D2, DD3). */
const DATED = ["due_date", "changed_due_date", "date_type", "original_committed_date", "promotion_milestone", "plan", "plan_maturity", "committed_plan_version"] as const;

/** True when a goal sets a date of its own. A goal with neither due_date nor date_type takes its parent's. */
const hasOwnDate = (goal: Row) => goal.due_date != null || goal.date_type != null;

/**
 * The goal as the rules and views read it (plan E-7): its own date, Date Type, Promotion Milestone, and plan,
 * or, when it sets no date, those of the nearest ancestor that does. `inherited` says which.
 * This is the one home of that resolution.
 */
export function resolvedGoal(goal: Row, getGoal: (id: string) => Row | undefined): Row & { inherited: boolean } {
  if (hasOwnDate(goal)) return { ...goal, inherited: false };
  const seen = new Set<unknown>([goal.id]);
  for (let at = typeof goal.parent === "string" ? getGoal(goal.parent) : undefined; at !== undefined && !seen.has(at.id); at = typeof at.parent === "string" ? getGoal(at.parent) : undefined) {
    seen.add(at.id);
    if (hasOwnDate(at)) return { ...goal, ...Object.fromEntries(DATED.map((f) => [f, at[f] ?? null])), inherited: true };
  }
  return { ...goal, inherited: true };
}

type CommittedDate = { date: string; kind: "Committed" | "Promotion Milestone" };

/** The committed date health is judged against (SPEC.md §6.1): its own, else its Promotion Milestone's. A sub-goal with no date reads its parent's (D2). */
export function committedDate(original: Row, getGoal: (id: string) => Row | undefined): CommittedDate | undefined {
  const goal = resolvedGoal(original, getGoal);
  if (goal.date_type === "Committed") {
    const date = currentDate(goal);
    return date === undefined ? undefined : { date, kind: "Committed" };
  }
  const milestone = typeof goal.promotion_milestone === "string" ? getGoal(goal.promotion_milestone) : undefined;
  const date = milestone === undefined ? undefined : currentDate(milestone);
  return date === undefined ? undefined : { date, kind: "Promotion Milestone" };
}

/**
 * The dates Home lists on a goal's row, and a sub-goal card shows (SPEC.md §8.2): the goal's own Committed or uncommitted date, then its Promotion Milestone's.
 * `own` is false when a sub-goal has its parent's date: it then lists only a slip. `goal` is resolved (resolvedGoal).
 */
export function goalDates(goal: Row, own: boolean, getGoal: (id: string) => Row | undefined, today: string): GoalDate[] {
  const dates: GoalDate[] = [];
  const judged = judgedDate(goal, getGoal, today);
  if (judged?.kind === "Committed" && (own || judged.slipDays !== undefined)) dates.push(judged);
  if (own) dates.push(...uncommittedDate(goal));
  if (judged?.kind === "Promotion Milestone" && (own || judged.slipDays !== undefined)) dates.push(judged);
  return dates;
}

/** The date health is judged on (SPEC.md §6.1), with slipDays when it passed while the goal is open. The one home of a slip. */
export function judgedDate(goal: Row, getGoal: (id: string) => Row | undefined, today: string): GoalDate | undefined {
  const committed = committedDate(goal, getGoal);
  if (committed === undefined) return undefined;
  return day(committed.date) < day(today) && isOpen(goal) ? { ...committed, slipDays: daysBetween(committed.date, today) } : committed;
}

/** The goal's own Ambition or Fantasy date, when it has one. `goal` is resolved. */
export function uncommittedDate(goal: Row): GoalDate[] {
  return goal.date_type === "Ambition" || goal.date_type === "Fantasy" ? [{ date: goal.due_date as string, kind: goal.date_type }] : [];
}

/**
 * The state a close records now (SPEC.md §7.2): Completed on or before the Original Committed Date, Completed Late after it.
 * Null when the goal has no Committed date. `goal` is resolved, so a sub-goal closes against its parent's date (D2).
 * The one home of this rule: rules.ts checks it, and the goal page shows it (G15).
 */
export function closesAs(goal: Row, today: string): "Completed" | "Completed Late" | null {
  const original = goal.original_committed_date;
  if (goal.date_type !== "Committed" || typeof original !== "string") return null;
  return today <= original ? "Completed" : "Completed Late";
}

/**
 * G15 Promote and close: the state an In Progress Ambition goal would close as, once promoted to Committed on its own date.
 * The promotion records that date as the Original Committed Date (write.ts applySystemFields), so this is closesAs on that goal.
 * Null for any other goal, including a sub-goal that takes its parent's Ambition date.
 */
export function closesAsPromoted(goal: Row, today: string): "Completed" | "Completed Late" | null {
  if (goal.state !== "In Progress" || goal.date_type !== "Ambition") return null;
  return closesAs({ ...goal, date_type: "Committed", original_committed_date: goal.due_date }, today);
}
