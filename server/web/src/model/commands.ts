import type { ApiViolation, ApiWorkItem, CommandsRequest, CommandsResponse, FormOptions, GoalFields, Health, PathToGreen, StoredGoal, WorkItemFields, WorkItemStatus } from "../../../src/api.ts";

/**
 * The goal page's panels as batches for POST /api/commands (docs/engineering/goal-page-and-create.md, Edits from the goal page).
 * Each panel is one update with base_version from the goal it read; a Fantasy promotion is a milestone create, then the update. The server checks every rule.
 */

/** The required fields a goal made from another one carries over from it: severity, origination, visibility, and plan maturity. */
const kept = (goal: Pick<StoredGoal, "severity" | "origination" | "visibility" | "plan_maturity">) => ({
  severity: goal.severity,
  origination: goal.origination,
  visibility: goal.visibility,
  plan_maturity: goal.plan_maturity,
});

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

/** A new Promotion Milestone is pursued with the health of the goal it backs (N6a). A goal with no health yet is not pursued, so neither is its milestone. */
const pursued = (health: Health, ptg: PathToGreen | null) =>
  health ? { state: "In Progress" as const, health, ...(health !== "GREEN" ? { path_to_green: ptg } : {}) } : { state: "Backlog" as const };

/** The Promotion Milestone being met. */
type MetMilestone = { id: string; version: number; state: StoredGoal["state"] };

/** Completes a met milestone. A Backlog milestone cannot move straight to Completed (SPEC.md §7), so it passes through In Progress, GREEN, in the same batch. */
function completes(met: MetMilestone, reason: string): CommandsRequest["commands"] {
  const done = (version: number) => ({ op: "update" as const, kind: "goal" as const, id: met.id, base_version: version, fields: { state: "Completed" as const }, reason });
  if (met.state !== "Backlog") return [done(met.version)];
  return [{ op: "update", kind: "goal", id: met.id, base_version: met.version, fields: { state: "In Progress", health: "GREEN" }, reason }, done(met.version + 1)];
}

/** Promote date (G14), Fantasy to Ambition: the met milestone is completed, the next Promotion Milestone is made ($m), then the goal points at it. The new date is sent only when it differs. */
export function promoteToAmbition(goal: StoredGoal, milestone: NewMilestone, newDate: string, reason: string, milestoneType: string, met?: MetMilestone): CommandsRequest {
  const date = newDate !== goal.due_date ? { due_date: newDate } : {};
  return {
    commands: [
      // The milestone that was met is completed first (G14).
      ...(met ? completes(met, reason) : []),
      { op: "create", kind: "goal", ref: "$m", fields: { ...milestone, type: milestoneType, date_type: "Committed", org_unit: goal.org_unit, level: goal.level, ...kept(goal), parent: goal.id, ...pursued(goal.health, goal.path_to_green) }, reason },
      { op: "update", kind: "goal", id: goal.id, base_version: goal.version, fields: { date_type: "Ambition", promotion_milestone: "$m", ...date }, reason },
    ],
  };
}

/** Promote date (G14), Ambition to Committed: the Promotion Milestone is completed first, then the goal is Committed and drops it. */
export function promoteToCommitted(goal: StoredGoal, milestone: MetMilestone, newDate: string, reason: string): CommandsRequest {
  const date = newDate !== goal.due_date ? { due_date: newDate } : {};
  return {
    commands: [
      ...completes(milestone, reason),
      { op: "update", kind: "goal", id: goal.id, base_version: goal.version, fields: { date_type: "Committed", promotion_milestone: null, ...date }, reason },
    ],
  };
}

/** Close goal (G15): the state the close records, with a reason. A closed goal has no health (review D3); History keeps the last one. */
export const closeBatch = (goal: StoredGoal, state: StoredGoal["state"], reason: string) => update(goal, { state, health: null }, reason);

/** Promote and close (G15): the Promotion Milestone is completed, the Ambition goal is Committed on its own date, then closed as the server computes. */
export function promoteAndClose(goal: StoredGoal, milestone: MetMilestone, state: StoredGoal["state"], reason: string): CommandsRequest {
  return {
    commands: [
      ...completes(milestone, reason),
      { op: "update", kind: "goal", id: goal.id, base_version: goal.version, fields: { date_type: "Committed", promotion_milestone: null }, reason },
      { op: "update", kind: "goal", id: goal.id, base_version: goal.version + 1, fields: { state, health: null }, reason },
    ],
  };
}

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

/** The type names from GET /api/options: a new goal's default type, and the Promotion Milestone type (§6.1, D1). The app writes no type name. */
export const goalTypes = (options: FormOptions): GoalTypes => ({ goal: options.defaults.type, milestone: options.promotionMilestoneType });

/** The type names the server's options give: a new goal's default type, and the type of a Promotion Milestone (§6.1, D1). */
type GoalTypes = { goal: string; milestone: string };

export type SubGoalRow = {
  summary: string;
  owner: string;
  /** A date of its own. With none, the sub-goal takes its parent's date and Date Type (D2). */
  date?: { due_date: string; date_type: "Committed" | "Ambition" | "Fantasy" };
  /** Its own Promotion Milestone, when its own date is Ambition or Fantasy. */
  milestone?: NewMilestone;
};

/**
 * + Sub-goal (G20): step 4 of the create order, with the page's goal as parent. It starts in Backlog.
 * A sub-goal with its own uncommitted date brings its milestone first ($m1), and the milestone then joins it as a sub-goal (steps 1 and 3).
 */
export function subGoalBatch(parent: StoredGoal, row: SubGoalRow, types: GoalTypes): CommandsRequest {
  const reason = `Sub-goal of ${parent.id}`;
  const base = { summary: row.summary, owner: row.owner, parent: parent.id, type: types.goal, org_unit: parent.org_unit, level: parent.level, ...kept(parent), state: "Backlog" as const };
  if (!row.date) return { commands: [{ op: "create", kind: "goal", ref: "$s1", fields: base, reason }] };
  if (row.date.date_type === "Committed" || !row.milestone) return { commands: [{ op: "create", kind: "goal", ref: "$s1", fields: { ...base, ...row.date }, reason }] };
  return {
    commands: [
      { op: "create", kind: "goal", ref: "$m1", fields: { ...row.milestone, type: types.milestone, date_type: "Committed", org_unit: parent.org_unit, level: parent.level, ...kept(parent), state: "Backlog" }, reason },
      { op: "create", kind: "goal", ref: "$s1", fields: { ...base, ...row.date, promotion_milestone: "$m1" }, reason },
      { op: "update", kind: "goal", id: "$m1", base_version: 1, fields: { parent: "$s1" }, reason },
    ],
  };
}

/** + Work item (G22): step 5 alone. Its Event's reason is "Filed". */
export function workItemBatch(goal: string, item: Pick<WorkItemFields, "title" | "owner" | "status" | "due_date">): CommandsRequest {
  return { commands: [{ op: "create", kind: "work_item", fields: { goal, ...item }, reason: "Filed" }] };
}

/** The work item tick (G24), or any status change: one update with its reason. */
export function workItemStatusBatch(item: Pick<ApiWorkItem, "id" | "version">, status: WorkItemStatus, reason: string): CommandsRequest {
  return { commands: [{ op: "update", kind: "work_item", id: item.id, base_version: item.version, fields: { status }, reason }] };
}

/** The New goal form (N1 to N16), as the batch builder reads it. A work item's `goal` is 0 for this goal, or k for the k-th sub-goal. */
export type NewGoalForm = {
  summary: string;
  description: string;
  owner: string;
  priority: string | null;
  due_date: string;
  date_type: "Committed" | "Ambition" | "Fantasy";
  health: Exclude<Health, null> | null;
  path_to_green: PathToGreen | null;
  plan: string | null;
  plan_maturity: GoalFields["plan_maturity"];
  more: Pick<GoalFields, "type" | "severity" | "state" | "origination" | "level" | "visibility" | "org_unit">;
  milestone: NewMilestone | null;
  /** Work Product links (§6.1), or none. */
  work_product?: GoalFields["work_product"];
  /** The type of a Promotion Milestone, from the server's options. */
  milestoneType: string;
  /** Set when the form opens from a goal page's + Sub-goal (N2). */
  parent?: string | null;
  subGoals: SubGoalRow[];
  workItems: { title: string; goal: number; owner: string; due_date: string | null }[];
};

/**
 * New goal as one batch, in the plan's create order: each Promotion Milestone ($m, then $m1, ...), this goal ($goal),
 * its milestone joining it, each sub-goal ($s1, ...) with its own milestone joining it, then each work item. `check` asks the server to roll it back and answer.
 */
export function createBatch(form: NewGoalForm, check = false): CommandsRequest {
  const reason = "New goal";
  const where = { org_unit: form.more.org_unit, level: form.more.level };
  // Milestones and sub-goals start in Backlog and carry the form's required fields (severity, origination, visibility, plan maturity).
  const carried = kept({ ...form.more, plan_maturity: form.plan_maturity });
  const milestone = (m: NewMilestone) => ({ ...m, type: form.milestoneType, date_type: "Committed" as const, ...where, ...carried, state: "Backlog" as const });
  // NF9: a goal made under a parent takes the parent's date, Date Type, Priority, and milestone (D2), so it sends none of its own.
  const inherit = Boolean(form.parent);
  const uncommitted = !inherit && form.date_type !== "Committed" && form.milestone;
  // A sub-goal with its own uncommitted date and milestone gets the next milestone ref: $m1, $m2, ...
  let n = 0;
  const own = form.subGoals.map((row, i) => ({ row, i, ref: row.date && row.date.date_type !== "Committed" && row.milestone ? (`$m${++n}` as const) : null }));
  const commands: CommandsRequest["commands"] = [];
  if (uncommitted && form.milestone) commands.push({ op: "create", kind: "goal", ref: "$m", fields: milestone(form.milestone), reason });
  for (const s of own) if (s.ref && s.row.milestone) commands.push({ op: "create", kind: "goal", ref: s.ref, fields: milestone(s.row.milestone), reason });
  commands.push({
    op: "create",
    kind: "goal",
    ref: "$goal",
    fields: {
      summary: form.summary,
      description: form.description,
      owner: form.owner,
      ...(form.priority && !inherit ? { priority: form.priority } : {}),
      ...(inherit ? {} : { due_date: form.due_date, date_type: form.date_type }),
      ...(uncommitted ? { promotion_milestone: "$m" } : {}),
      ...(form.health ? { health: form.health, ...(form.health !== "GREEN" ? { path_to_green: form.path_to_green } : {}) } : {}),
      plan: form.plan,
      plan_maturity: form.plan_maturity,
      ...(form.parent ? { parent: form.parent } : {}),
      ...(form.work_product?.length ? { work_product: form.work_product } : {}),
      ...form.more,
    },
    reason,
  });
  // The milestone joins this goal and, with a health, is pursued with it (N6a), in one update: a check that skips it
  // (because this goal's create was refused) leaves no later command on a version it never reached (QA N4: that answered stale and hid every refusal).
  if (uncommitted) commands.push({ op: "update", kind: "goal", id: "$m", base_version: 1, fields: { parent: "$goal", ...(form.health ? pursued(form.health, form.path_to_green) : {}) }, reason });
  for (const s of own) {
    const ref = `$s${s.i + 1}` as `$${string}`;
    commands.push({
      op: "create",
      kind: "goal",
      ref,
      fields: { summary: s.row.summary, owner: s.row.owner, parent: "$goal", type: form.more.type, ...where, ...carried, state: "Backlog", ...(s.row.date ?? {}), ...(s.ref ? { promotion_milestone: s.ref } : {}) },
      reason,
    });
    if (s.ref) commands.push({ op: "update", kind: "goal", id: s.ref, base_version: 1, fields: { parent: ref }, reason });
  }
  for (const w of form.workItems) {
    commands.push({ op: "create", kind: "work_item", fields: { goal: w.goal === 0 ? "$goal" : `$s${w.goal}`, title: w.title, owner: w.owner, status: "In Progress", due_date: w.due_date }, reason: "Filed" });
  }
  return check ? { commands, check: true } : { commands };
}

/**
 * Which part of the New goal form a command of createBatch came from, so a refusal at `at` shows there:
 * "goal", "milestone" (this goal's), "sub:k" (the k-th sub-goal or its milestone), or "workitem:k".
 */
export function commandPlace(batch: CommandsRequest, at: number): string {
  const command = batch.commands[at];
  if (!command) return "goal";
  if (command.op === "create" && command.kind === "work_item") return `workitem:${batch.commands.slice(0, at).filter((c) => c.op === "create" && c.kind === "work_item").length}`;
  const ref = command.op === "create" ? command.ref : command.op === "update" ? command.id : undefined;
  if (ref === "$goal") return "goal";
  if (ref === "$m") return "milestone";
  if (typeof ref === "string" && /^\$s\d+$/.test(ref)) return `sub:${Number(ref.slice(2)) - 1}`;
  if (typeof ref === "string" && /^\$m\d+$/.test(ref)) {
    const owner = batch.commands.find((c) => c.op === "create" && c.kind === "goal" && c.fields.promotion_milestone === ref && c.ref !== "$goal");
    if (owner && owner.op === "create" && owner.ref) return `sub:${Number(owner.ref.slice(2)) - 1}`;
  }
  return "goal";
}

/** Every refusal in an answer, each with its place on the form. A check run lists every refused command in `all`; a save, the first. */
export function refusals(answer: CommandsResponse, batch: CommandsRequest): (ApiViolation & { place: string })[] {
  if (answer.ok) return [];
  if (answer.error !== "invalid") return [{ rule: answer.error, message: answer.error === "stale" ? "" : answer.message, place: commandPlace(batch, answer.at) }];
  return (answer.all ?? answer.violations.map((v) => ({ ...v, at: answer.at })))
    .filter((v) => v.rule !== NOT_CHECKED)
    .map(({ at, ...v }) => ({ ...v, place: commandPlace(batch, at) }));
}

/** A check names each command it could not run, because it uses a refused create (QA Q11). Those are checks still to come, not fixes. */
const NOT_CHECKED = "not-checked";
export const notChecked = (answer: CommandsResponse) => (!answer.ok && answer.error === "invalid" ? (answer.all ?? []).filter((v) => v.rule === NOT_CHECKED).length : 0);

/** POST /api/commands answers with CommandsResponse, but a 403, 413, or 415 answers ApiError ({ error, reason }). That one reads as a refusal with its reason (QA F1). */
export function commandsAnswer(body: unknown): CommandsResponse {
  const b = body as { ok?: unknown; error?: unknown; reason?: string } | null;
  if (typeof b?.ok === "boolean") return b as CommandsResponse;
  return { ok: false, at: 0, error: "bad_command", message: b?.reason ?? String(b?.error ?? "The server refused the save.") };
}

type SavedAction = "subgoal" | "workitem" | "promote" | "promote-close" | "slip" | "close";

/** G26: after a save that adds or moves something out of view, one line says what happened, naming the new key from the answer. */
export function savedStatus(action: SavedAction, answer: CommandsResponse, x: { to?: string; state?: string; date?: string } = {}): string {
  if (!answer.ok) return "";
  switch (action) {
    case "subgoal":
      return `Added ${answer.ids["$s1"]} under this goal.`;
    case "workitem":
      return `Added ${answer.events.find((e) => e.entity_kind === "work_item" && e.field === "title")?.entity ?? "a work item"} to this goal.`;
    case "promote":
      return answer.ids["$m"] ? `Promoted to ${x.to}. ${answer.ids["$m"]} is the next Promotion Milestone.` : `Promoted to ${x.to}.`;
    case "promote-close":
      return `Promoted to Committed and closed as ${x.state}.`;
    case "slip":
      return `Recorded a slip to ${x.date}.`;
    case "close":
      return `Closed as ${x.state}.`;
  }
}

/** Drag to reorder Priorities (Chelsea, 2026-10-25): one batch, one update per Priority whose rank changes, all with one reason. The server checks 1 to n, no gap, no tie, when the batch ends. */
export function rankBatch(priorities: { id: string; rank: number; version: number }[], order: string[], reason: string): CommandsRequest {
  return {
    commands: order.flatMap((id, i) => {
      const p = priorities.find((x) => x.id === id);
      return p && p.rank !== i + 1 ? [{ op: "update" as const, kind: "priority" as const, id, base_version: p.version, fields: { rank: i + 1 }, reason }] : [];
    }),
  };
}

/** A keyboard move: one place up (-1) or down (1), held inside the list. */
export function moveIn(order: string[], id: string, by: -1 | 1): string[] {
  const i = order.indexOf(id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= order.length) return order;
  const next = [...order];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** A drop: the Priority lands at drop line `index`, 0 above the first, n below the last. */
export function moveTo(order: string[], id: string, index: number): string[] {
  const from = order.indexOf(id);
  if (from < 0) return order;
  const rest = order.filter((x) => x !== id);
  const at = index > from ? index - 1 : index;
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}
