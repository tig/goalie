/**
 * The SPEC.md §8.1 validation rules the MLP uses. Each rule checks the committed result.
 * A rule returns violations. The write path rolls back when there is one.
 */

import { currentDate, DATE_TYPES } from "./goal.ts";

export type Row = Record<string, unknown>;

/** A broken invariant. `rule` is a stable name a caller can match. */
export type Violation = { rule: string; message: string };

/** Read access the rules need. The write path supplies it inside its transaction. */
export interface Lookup {
  get(kind: string, id: string): Row | undefined;
  where(kind: string, field: string, value: unknown): Row[];
}


/** Goal fields whose change needs a reason (SPEC.md §6.1, §8.1). */
export const REASONED: Record<string, readonly string[]> = {
  goal: ["due_date", "changed_due_date", "date_type", "state", "health"],
  priority: ["rank", "status"],
};

/** Fields only the write path sets. A command must not name them. */
export const SYSTEM_FIELDS: Record<string, readonly string[]> = {
  goal: ["original_committed_date", "committed_plan_version"],
};

function isHuman(store: Lookup, id: unknown): boolean {
  return typeof id === "string" && store.get("actor", id)?.kind === "human";
}

export function checkGoal(store: Lookup, goal: Row): Violation[] {
  const found: Violation[] = [];
  const add = (rule: string, message: string) => found.push({ rule, message });
  if (!isHuman(store, goal.owner)) {
    add("one-human-owner", `${goal.id}: the owner must be exactly one human actor.`);
  }
  if (typeof goal.due_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(goal.due_date) || !(DATE_TYPES as readonly unknown[]).includes(goal.date_type)) {
    add("date-and-date-type", `${goal.id}: every goal has a date and a Date Type.`);
  }
  if (goal.date_type === "Committed") {
    if (goal.promotion_milestone != null) {
      add("promotion-milestone", `${goal.id}: a Committed goal has no Promotion Milestone.`);
    }
    if (goal.plan_maturity !== "Pencil" || !goal.plan) {
      add("committed-needs-pencil", `${goal.id}: a Committed date needs a Plan at Pencil.`);
    }
  } else if (goal.date_type != null) {
    const milestone = typeof goal.promotion_milestone === "string" ? store.get("goal", goal.promotion_milestone) : undefined;
    if (milestone === undefined) {
      add("promotion-milestone", `${goal.id}: an ${goal.date_type} date needs a Promotion Milestone.`);
    } else if (
      milestone.type !== "Milestone (Commit)" ||
      milestone.date_type !== "Committed" ||
      !isHuman(store, milestone.owner) ||
      !((currentDate(milestone) as string) < (goal.due_date as string))
    ) {
      add(
        "promotion-milestone",
        `${goal.id}: the Promotion Milestone ${milestone.id} must be a Milestone (Commit) with a Committed date before ${goal.due_date} and a human owner.`,
      );
    }
  }
  if (goal.state === "In Progress" && goal.health == null) {
    add("health-while-in-progress", `${goal.id}: an In Progress goal has a health.`);
  }
  if ((goal.health === "YELLOW" || goal.health === "RED") && !hasContent(goal.path_to_green)) {
    add("ptg-when-yellow-or-red", `${goal.id}: a ${goal.health} goal has a Path to Green.`);
  }
  return found;
}

function hasContent(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

export function checkOrgUnit(store: Lookup, unit: Row): Violation[] {
  return isHuman(store, unit.owner)
    ? []
    : [{ rule: "one-human-owner", message: `${unit.id}: the owner must be exactly one human actor.` }];
}

export function checkActor(store: Lookup, actor: Row): Violation[] {
  const ok = actor.kind === "agent" ? isHuman(store, actor.operator) : actor.operator == null;
  return ok
    ? []
    : [{ rule: "agent-operator", message: `${actor.id}: an agent names a human operator, and a human has none.` }];
}

export function checkPriority(store: Lookup, priority: Row): Violation[] {
  if (priority.status !== "Current") return [];
  const tied = store
    .where("priority", "org_unit", priority.org_unit)
    .filter((p) => p.id !== priority.id && p.status === "Current" && p.period === priority.period && p.rank === priority.rank);
  return tied.length === 0
    ? []
    : [{ rule: "no-rank-ties", message: `${priority.id}: rank ${priority.rank} is already held by ${tied[0].id}.` }];
}

/** Check one written entity, and every goal whose rules read it. */
export function checkWrite(store: Lookup, kind: string, row: Row): Violation[] {
  switch (kind) {
    case "goal":
      return [
        ...checkGoal(store, row),
        ...store.where("goal", "promotion_milestone", row.id).flatMap((g) => checkGoal(store, g)),
      ];
    case "org_unit":
      return checkOrgUnit(store, row);
    case "actor":
      // A change of kind can break the rules of what the actor owns or operates.
      return [
        ...checkActor(store, row),
        ...store.where("goal", "owner", row.id).flatMap((g) => checkWrite(store, "goal", g)),
        ...store.where("org_unit", "owner", row.id).flatMap((u) => checkOrgUnit(store, u)),
        ...store.where("actor", "operator", row.id).flatMap((a) => checkActor(store, a)),
      ];
    case "priority":
      return checkPriority(store, row);
    default:
      return [];
  }
}

/** Transition rules: they compare the row before and after a write. */
export function checkTransition(kind: string, before: Row | undefined, after: Row): Violation[] {
  if (kind === "goal" && before?.date_type === "Committed" && after.date_type !== "Committed") {
    return [{ rule: "committed-not-demotable", message: `${after.id}: a Committed date can't be demoted. A missed date is a slip.` }];
  }
  return [];
}

/** Lint from SPEC.md §6.1: a summary has 5 words or more. It flags, it does not block. */
export function summaryLint(goal: Row): string | undefined {
  const words = String(goal.summary ?? "").trim().split(/\s+/).filter(Boolean);
  return words.length >= 5 ? undefined : `${goal.id}: the summary has ${words.length} words; it needs 5 or more.`;
}
