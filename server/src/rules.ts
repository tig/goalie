/**
 * The SPEC.md §8.1 validation rules the MLP uses. Each rule checks the committed result.
 * A rule returns violations. The write path rolls back when there is one.
 */

import { isDate } from "./dates.ts";
import { COMPLETED_STATES, currentDate, DATE_TYPES, resolvedGoal, STATE_MOVES, type State } from "./goal.ts";

export type Row = Record<string, unknown>;

/** A broken invariant. `rule` is a stable name a caller can match. `field` is the field it points to, when there is one. */
export type Violation = { rule: string; message: string; field?: string };

/** Read access the rules need. The write path supplies it inside its transaction. */
export interface Lookup {
  get(kind: string, id: string): Row | undefined;
  where(kind: string, field: string, value: unknown): Row[];
}


/** Goal fields whose change needs a reason (SPEC.md §6.1, §8.1). */
export const REASONED: Record<string, readonly string[]> = {
  goal: ["due_date", "changed_due_date", "date_type", "state", "health"],
  priority: ["rank", "status"],
  work_item: ["status", "owner", "due_date"],
};

/** Fields only the write path sets. A command must not name them. */
export const SYSTEM_FIELDS: Record<string, readonly string[]> = {
  goal: ["original_committed_date", "committed_plan_version"],
};

function isHuman(store: Lookup, id: unknown): boolean {
  return typeof id === "string" && store.get("actor", id)?.kind === "human";
}

function checkGoal(store: Lookup, own: Row): Violation[] {
  const found: Violation[] = [];
  const add = (rule: string, message: string, field: string) => found.push({ rule, message, field });
  // A sub-goal with no date of its own is checked on its parent's date, Date Type, Promotion Milestone, and plan (D2, DD3).
  const goal = resolvedGoal(own, (id) => store.get("goal", id));
  if (!isHuman(store, goal.owner)) {
    add("one-human-owner", `${goal.id}: the owner must be exactly one human actor.`, "owner");
  }
  if (goal.due_date == null || !(DATE_TYPES as readonly unknown[]).includes(goal.date_type)) {
    add("date-and-date-type", `${goal.id}: every goal has a date and a Date Type, its own or its parent's.`, goal.due_date == null ? "due_date" : "date_type");
  } else if (!isDate(goal.due_date)) {
    add("real-date", `${goal.id}: due_date ${String(goal.due_date)} is not a calendar date.`, "due_date");
  }
  if (goal.date_type === "Committed") {
    if (goal.promotion_milestone != null) {
      add("promotion-milestone", `${goal.id}: a Committed goal has no Promotion Milestone.`, "promotion_milestone");
    }
    // D1: a Promotion Milestone is committed on the plan of the goal it promotes.
    if (goal.type !== "Milestone (Commit)" && (goal.plan_maturity !== "Pencil" || !goal.plan)) {
      add("committed-needs-pencil", `${goal.id}: a Committed date needs a Plan at Pencil.`, "plan_maturity");
    }
  } else if (goal.date_type != null) {
    const milestone = typeof goal.promotion_milestone === "string" ? store.get("goal", goal.promotion_milestone) : undefined;
    if (milestone === undefined) {
      add("promotion-milestone", `${goal.id}: an ${goal.date_type} date needs a Promotion Milestone.`, "promotion_milestone");
    } else if (
      milestone.type !== "Milestone (Commit)" ||
      milestone.date_type !== "Committed" ||
      !isHuman(store, milestone.owner) ||
      !((currentDate(milestone) as string) < (goal.due_date as string))
    ) {
      add(
        "promotion-milestone",
        `${goal.id}: the Promotion Milestone ${milestone.id} must be a Milestone (Commit) with a Committed date before ${goal.due_date} and a human owner.`,
        "promotion_milestone",
      );
    }
  }
  if (own.changed_due_date != null && own.date_type !== "Committed") {
    add("changed-date-only-when-committed", `${goal.id}: only a Committed goal has a changed_due_date. It records a slip.`, "changed_due_date");
  } else if (own.changed_due_date != null && !isDate(own.changed_due_date)) {
    add("real-date", `${goal.id}: changed_due_date ${String(own.changed_due_date)} is not a calendar date.`, "changed_due_date");
  }
  if ((COMPLETED_STATES as readonly unknown[]).includes(goal.state) && goal.date_type !== "Committed") {
    add("completed-needs-committed", `${goal.id}: a ${goal.state} goal has a Committed date.`, "date_type");
  }
  if (isOwnAncestor(store, goal)) {
    add("parent-not-cycle", `${goal.id}: a goal cannot be its own ancestor.`, "parent");
  }
  if (goal.state === "In Progress" && goal.health == null) {
    add("health-while-in-progress", `${goal.id}: an In Progress goal has a health.`, "health");
  }
  if ((goal.health === "YELLOW" || goal.health === "RED") && !isPathToGreen(store, goal.path_to_green)) {
    add(
      "ptg-when-yellow-or-red",
      `${goal.id}: a ${goal.health} goal has a Path to Green: at least one step, each with text, a human owner, and a date, and criteria for GREEN.`,
      "path_to_green",
    );
  }
  return found;
}

/** The Path to Green shape (SPEC.md §6.1, D6). A missing trigger on YELLOW is a lint, not a rule. */
function isPathToGreen(store: Lookup, value: unknown): boolean {
  const ptg = value as { steps?: unknown; criteria?: unknown } | null;
  if (typeof ptg !== "object" || ptg === null || !Array.isArray(ptg.steps) || ptg.steps.length === 0) return false;
  const stepOk = (step: { text?: unknown; owner?: unknown; date?: unknown }) =>
    typeof step?.text === "string" && step.text.trim() !== "" && isHuman(store, step.owner) && isDate(step.date);
  return (ptg.steps as { text?: unknown; owner?: unknown; date?: unknown }[]).every(stepOk) && typeof ptg.criteria === "string" && ptg.criteria.trim() !== "";
}

/** Work-item status values (D8): SPEC.md §6.1 State words. */
const WORK_ITEM_STATUSES = ["Backlog", "In Progress", "Completed", "Deleted"];

/** The work-item extension (SPEC.md §6.7): on only by the owner setting work_items (D7). */
function checkWorkItem(store: Lookup, item: Row): Violation[] {
  const settings = store.get("owner_settings", "owner")?.settings as Row | undefined;
  if (settings?.work_items !== true) {
    return [{ rule: "work-items-off", message: "work items are off for this deployment. The GOALIE owner turns them on (owner setting work_items)." }];
  }
  const found: Violation[] = [];
  if (!WORK_ITEM_STATUSES.includes(item.status as string)) {
    found.push({ rule: "work-item-status", message: `${item.id}: status is one of ${WORK_ITEM_STATUSES.join(", ")}.`, field: "status" });
  }
  if (item.due_date != null && !isDate(item.due_date)) {
    found.push({ rule: "real-date", message: `${item.id}: due_date ${String(item.due_date)} is not a calendar date.`, field: "due_date" });
  }
  return found;
}

function isOwnAncestor(store: Lookup, goal: Row): boolean {
  const seen = new Set<unknown>();
  for (let at = goal.parent; typeof at === "string" && !seen.has(at); at = store.get("goal", at)?.parent) {
    if (at === goal.id) return true;
    seen.add(at);
  }
  return false;
}


function checkOrgUnit(store: Lookup, unit: Row): Violation[] {
  return isHuman(store, unit.owner)
    ? []
    : [{ rule: "one-human-owner", message: `${unit.id}: the owner must be exactly one human actor.`, field: "owner" }];
}

function checkActor(store: Lookup, actor: Row): Violation[] {
  const ok = actor.kind === "agent" ? isHuman(store, actor.operator) : actor.operator == null;
  return ok
    ? []
    : [{ rule: "agent-operator", message: `${actor.id}: an agent names a human operator, and a human has none.`, field: "operator" }];
}

function checkPriority(store: Lookup, priority: Row): Violation[] {
  if (priority.status !== "Current") return [];
  const tied = store
    .where("priority", "org_unit", priority.org_unit)
    .filter((p) => p.id !== priority.id && p.status === "Current" && p.period === priority.period && p.rank === priority.rank);
  return tied.length === 0
    ? []
    : [{ rule: "no-rank-ties", message: `${priority.id}: rank ${priority.rank} is already held by ${tied[0].id}.`, field: "rank" }];
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
    case "work_item":
      return checkWorkItem(store, row);
    default:
      return [];
  }
}

/** Transition rules: they compare the row before and after a write (SPEC.md §5, §7). `today` is the org's day, so the rule stays pure. */
export function checkTransition(kind: string, before: Row | undefined, after: Row, today: string): Violation[] {
  if (kind !== "goal" || before === undefined) return [];
  const found: Violation[] = [];
  const from = DATE_TYPES.indexOf(before.date_type as never);
  const to = DATE_TYPES.indexOf(after.date_type as never);
  if (before.date_type === "Committed" && after.date_type !== "Committed") {
    found.push({ rule: "committed-not-demotable", message: `${after.id}: a Committed date can't be demoted. A missed date is a slip.`, field: "date_type" });
  } else if (before.date_type === "Committed" && before.due_date !== after.due_date) {
    // SPEC.md §6.1: no silent re-baselines. Rewriting due_date would erase the slip.
    found.push({ rule: "no-silent-re-baseline", message: `${after.id}: a Committed date moves only as a slip: set changed_due_date, with a reason.`, field: "due_date" });
  } else if (from !== -1 && to - from > 1) {
    found.push({ rule: "date-lifecycle", message: `${after.id}: a ${before.date_type} date is promoted one step, to ${DATE_TYPES[from + 1]}.`, field: "date_type" });
  } else if (before.date_type === "Fantasy" && after.date_type === "Ambition" && after.promotion_milestone === before.promotion_milestone) {
    // SPEC.md §5: the milestone that promoted Fantasy to Ambition is met; Ambition needs the next one.
    found.push({ rule: "promotion-new-milestone", message: `${after.id}: a promotion to Ambition names a new Promotion Milestone.`, field: "promotion_milestone" });
  }
  const original = after.original_committed_date;
  if (before.state !== after.state && typeof original === "string") {
    // SPEC.md §7.2: Completed is met on or before the Original Committed Date, Completed Late after it.
    if (after.state === "Completed" && today > original) {
      found.push({ rule: "completed-on-time", message: `${after.id}: met after ${original}, so it is Completed Late.`, field: "state" });
    } else if (after.state === "Completed Late" && today <= original) {
      found.push({ rule: "completed-on-time", message: `${after.id}: met on or before ${original}, so it is Completed.`, field: "state" });
    }
  }
  const moves = STATE_MOVES[before.state as State];
  if (before.state !== after.state && moves !== undefined && !(moves as readonly unknown[]).includes(after.state)) {
    found.push({ rule: "state-lifecycle", message: `${after.id}: a ${before.state} goal cannot move to ${after.state}.`, field: "state" });
  }
  return found;
}

/**
 * Who may write what (SPEC.md §6.9, §10, §12; ADR 0011). `actor` is the writer's row; `before` is the row the write replaces.
 * `owner` is the GOALIE owner, or undefined before the owner settings exist.
 */
export function checkAuthor(actor: Row, owner: string | undefined, kind: string, before: Row | undefined, after: Row): Violation[] {
  if (actor.kind === "agent" && (kind === "goal" || kind === "priority")) {
    return [{ rule: "agent-writes-a-draft", message: `${actor.id} is an agent. An agent proposes a change to a ${kind} as a Draft.` }];
  }
  // An actor row maps a token to an actor, and an org unit holds the goals. A write there could take over another actor.
  if ((kind === "actor" || kind === "org_unit") && (actor.kind !== "human" || (owner !== undefined && actor.id !== owner))) {
    return [{ rule: "owner-writes-actors", message: `${actor.id}: only the GOALIE owner writes actors and org units.` }];
  }
  // A Draft is its agent's proposal (SPEC.md §6.9). Only that agent writes it, and its actor never changes.
  // SPEC.md §6.7, story 29: an agent works its own work items. It may file one for itself.
  if (kind === "work_item" && actor.kind === "agent" && (after.owner !== actor.id || (before !== undefined && before.owner !== actor.id))) {
    return [{ rule: "agent-own-work-items", message: `${actor.id}: an agent writes only the work items it owns.`, field: "owner" }];
  }
  if (kind === "draft" && (actor.kind !== "agent" || after.actor !== actor.id || (before !== undefined && before.actor !== actor.id))) {
    return [{ rule: "draft-by-its-agent", message: `${actor.id}: only the agent that proposed a Draft writes it.` }];
  }
  if (kind === "owner_settings" && actor.id !== (before ?? after).owner) {
    return [{ rule: "owner-settings", message: `${actor.id}: only the GOALIE owner changes owner settings.` }];
  }
  if (kind === "user_settings" && (actor.kind !== "human" || actor.id !== after.id)) {
    return [{ rule: "user-settings", message: `${actor.id}: a human changes only their own user settings.` }];
  }
  return [];
}

/** Lint from SPEC.md §6.1: a summary has 5 words or more. It flags, it does not block. */
export function summaryLint(goal: Row): string | undefined {
  const words = String(goal.summary ?? "").trim().split(/\s+/).filter(Boolean);
  return words.length >= 5 ? undefined : `${goal.id}: the summary has ${words.length} words; it needs 5 or more.`;
}

/** The §6.1 description parts, each with words that show it is there. A heuristic: it flags, it does not block. */
const DESCRIPTION_PARTS: { words: RegExp; hint: string }[] = [
  { words: /key result/i, hint: "Add the key results" },
  { words: /metric|measure/i, hint: "Add the metrics and how often they are reviewed" },
  { words: /why|matters|contributes/i, hint: "Add why it matters" },
  { words: /responsib|shares|joint owner/i, hint: "Add who shares responsibility" },
];

/** Lints from SPEC.md §6.1, as hints at the field they point to. They flag; they never block (§8.1). */
export function goalLints(goal: Row): { field: string; text: string }[] {
  const hints: { field: string; text: string }[] = [];
  const words = String(goal.summary ?? "").trim().split(/\s+/).filter(Boolean).length;
  if (words < 5) hints.push({ field: "summary", text: `The summary has ${words} words. Use 5 or more, starting with a verb.` });
  const description = String(goal.description ?? "");
  for (const part of DESCRIPTION_PARTS) if (!part.words.test(description)) hints.push({ field: "description", text: part.hint });
  const ptg = goal.path_to_green as { trigger?: unknown } | null;
  if (goal.health === "YELLOW" && (typeof ptg?.trigger !== "string" || ptg.trigger.trim() === "")) {
    hints.push({ field: "path_to_green", text: "Name the trigger that turns this RED." });
  }
  const product = goal.work_product;
  if (goal.type === "Milestone (Launch)" && goal.state === "In Progress" && (!Array.isArray(product) || product.length === 0)) {
    hints.push({ field: "work_product", text: "Link the work product." });
  }
  return hints;
}
