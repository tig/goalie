/**
 * The JSON contract between the server and the React app (ADR 0003, ADR 0010).
 * The server builds these values from the store. The app draws them and holds no rule.
 * Dates are ISO strings (YYYY-MM-DD). Labels are made in the app.
 */

import type { State } from "./goal.ts";

export type Health = "GREEN" | "YELLOW" | "RED" | null;

/** How firm a date is (SPEC.md §5). A Promotion Milestone date is a Committed date that backs another goal's uncommitted date. */
type DateKind = "Committed" | "Promotion Milestone" | "Ambition" | "Fantasy";

/** One date of a goal. `slipDays` is set when a Committed date has passed while the goal is open. */
export type GoalDate = { date: string; kind: DateKind; slipDays?: number };

export type ActorRef = { id: string; name: string };

/** The first step of a Path to Green (SPEC.md §6.1). */
export type PtgStep = { text: string; owner?: ActorRef; date?: string };

export type ApiGoal = {
  id: string;
  summary: string;
  owner: ActorRef;
  state: State;
  health: Health;
  /** The goal's own dates, then its Promotion Milestone's. Empty when they are the same as its parent's. */
  dates: GoalDate[];
  /** When the goal started: its first move to In Progress, else its first Event. */
  started: string;
  /** Set when health is YELLOW or RED. */
  ptg?: PtgStep;
  children: ApiGoal[];
};

export type ApiPriority = { id: string; rank: number; title: string; goals: ApiGoal[] };

export type ApiSummary = {
  counts: { RED: number; YELLOW: number; GREEN: number };
  /** One health per goal in progress above the cut line, in rank order. */
  healths: Health[];
  slips: { goal: string; summary: string; date: string; kind: "Committed" | "Promotion Milestone"; days: number }[];
  /** Drafts waiting on an owner. */
  drafts: number;
  nextPromotion?: { milestone: string; date: string; days: number; goal: string; summary: string };
};

/** GET /api/priorities. The saved Priorities view (SPEC.md §8.2) for the org unit, with every goal. The app filters it. */
export type PrioritiesResponse = {
  org: { id: string; name: string; level: string };
  me: ActorRef;
  today: string;
  view: { name: string; columns: readonly string[] };
  /** Priorities above the cut line, in rank order. */
  funded: ApiPriority[];
  /** Priorities below the cut line, in rank order. */
  backlog: ApiPriority[];
  summary: ApiSummary;
};

/** Every refusal from the API: 401 with no verified actor, 4xx for a bad request. */
export type ApiError = { error: string; reason: string };

/*
 * Goal page and goal creation (docs/engineering/goal-page-and-create.md).
 * Stored rows keep the SPEC.md §6 field names, so the app edits a field and sends it back under the same name.
 * Actor fields hold actor ids. Each response carries `actors`, which names every id it holds.
 */

export type DateType = "Committed" | "Ambition" | "Fantasy";
export type PlanMaturity = "Watercolor" | "Crayon" | "Pencil";
export type Origination = "New" | "Carryover" | "Repeating";
export type ActorKind = "human" | "agent";

/** An actor with its kind, so the app draws a human and an agent apart (SPEC.md §6.4). */
export type ApiActor = ActorRef & { kind: ActorKind };

/** A goal named from another goal: its key and summary. */
export type GoalRef = { id: string; summary: string };

/** The Path to Green (SPEC.md §6.1, D6): steps with a named human owner and a date, criteria for GREEN, and for YELLOW the trigger for RED. */
export type PathToGreen = { steps: { text: string; owner: string; date: string }[]; criteria: string; trigger?: string };

/** A typed link of a goal's Work Product (SPEC.md §6.1), for example { repo: "github.com/tig/goalie" }. */
export type WorkProductLink = Record<string, string>;

/** The writable fields of a goal (SPEC.md §6.1). A sub-goal with no date of its own has null due_date and date_type: it takes its parent's (D2). */
export type GoalFields = {
  summary: string;
  description: string;
  owner: string;
  org_unit: string;
  level: string;
  type: string;
  due_date: string | null;
  date_type: DateType | null;
  promotion_milestone: string | null;
  plan: string | null;
  plan_maturity: PlanMaturity;
  work_product: WorkProductLink[] | null;
  changed_due_date: string | null;
  severity: string;
  priority: string | null;
  state: State;
  health: Exclude<Health, null> | null;
  path_to_green: PathToGreen | null;
  origination: Origination;
  parent: string | null;
  visibility: string;
};

/** A goal as stored: its key, its version, the fields the system sets, and its writable fields. */
export type StoredGoal = GoalFields & {
  id: string;
  version: number;
  original_committed_date: string | null;
  committed_plan_version: number | null;
};

/** Work-item status values (D8): SPEC.md §6.1 State words. */
export type WorkItemStatus = "Backlog" | "In Progress" | "Completed" | "Deleted";

/** The writable fields of a work item (SPEC.md §6.7). `owner` may be an agent. `links` are plain URLs in the MLP. */
export type WorkItemFields = { goal: string; title: string; owner: string; status: WorkItemStatus; due_date: string | null; links: string[] | null };

/** A work item as stored, and `late` when it is not Completed or Deleted and its due date has passed. */
export type ApiWorkItem = WorkItemFields & { id: string; version: number; late: boolean };

/** One Event (SPEC.md §6.6). A comment is an Event with field "comment", old null, and the text as new. */
export type ApiEvent = {
  sequence: number;
  timestamp: string;
  actor: string;
  entity_kind: "goal" | "work_item";
  entity: string;
  field: string;
  old: unknown;
  new: unknown;
  reason: string | null;
};

/** A sub-goal as a card on its parent's page (G21). */
export type SubGoalCard = GoalRef & {
  owner: string;
  state: State;
  health: Health;
  /** Its own dates, as on Home. Empty when it takes this goal's date (D2). */
  dates: GoalDate[];
  /** True when it is this goal's Promotion Milestone. */
  promotionMilestone: boolean;
  subGoals: number;
  /** Completed of every work item not Deleted. Absent when work items are off. */
  workItems?: { completed: number; total: number };
};

/** GET /api/goals/:id. 404 with ApiError when there is no such goal. A Deleted goal answers like any other (SPEC.md §8.1). */
export type GoalPageResponse = {
  me: ApiActor;
  today: string;
  goal: StoredGoal;
  /** The dates as drawn (G5): the date health is judged on first, then the goal's own date. A slip carries slipDays. */
  dates: GoalDate[];
  /** True when the goal takes its parent's date and Date Type (D2). */
  inherited: boolean;
  /** When the goal started: its first move to In Progress, else its first Event. */
  started: string;
  /** The state a Close would record now: Completed, or Completed Late against original_committed_date (G15). Null when the goal cannot be completed. */
  closesAs: "Completed" | "Completed Late" | null;
  /** The goal's Promotion Milestone, and what is still open under it (G14). */
  promotionMilestone: (GoalRef & { state: State; date: string; openSubGoals: number; openWorkItems: number }) | null;
  parent: GoalRef | null;
  priority: { id: string; rank: number; title: string } | null;
  orgUnit: { id: string; name: string; level: string };
  subGoals: SubGoalCard[];
  /** Null when the owner setting work_items is off (D7). */
  workItems: ApiWorkItem[] | null;
  /** The goal's Events and its work items' Events, newest first. Comments are among them. */
  events: ApiEvent[];
  /** What waits on the signed-in actor here (G3a). */
  needsYou: { lateWorkItems: string[]; missingPtg: boolean };
  /** Lints: flagged, never blocked (SPEC.md §8.1). The app shows the text as a muted hint at the field. */
  hints: { field: string; text: string }[];
  actors: Record<string, ApiActor>;
};

/** GET /api/options. What the New goal form, + Sub-goal, and + Work item offer, with the defaults the server writes. */
export type FormOptions = {
  me: ApiActor;
  today: string;
  orgUnit: { id: string; name: string; level: string };
  /** The next unused goal keys, in order: the first is this goal's, the next ones its Promotion Milestone's and its sub-goals' (N11, N12). */
  nextGoalKeys: string[];
  /** Humans may own a goal. Any actor may own a work item. */
  actors: ApiActor[];
  /** The org unit's current Priorities, in rank order (N4). */
  priorities: { id: string; rank: number; title: string }[];
  defaults: Pick<GoalFields, "description" | "org_unit" | "level" | "type" | "severity" | "state" | "origination" | "visibility" | "plan_maturity">;
  choices: { type: string[]; severity: string[]; level: string[]; plan_maturity: PlanMaturity[]; workItemStatus: WorkItemStatus[] };
  /** The owner setting work_items (D7). */
  workItems: boolean;
};

/** A name for an entity a batch creates, written "$" and a word. A later command uses it as an id or a field value, and the server puts the key there. */
export type Ref = `$${string}`;

/** One command of POST /api/commands. Only goals and work items are written through the API in the MLP. */
export type ApiCommand =
  | { op: "create"; kind: "goal"; ref?: Ref; fields: Partial<GoalFields>; reason: string }
  | { op: "create"; kind: "work_item"; ref?: Ref; fields: Partial<WorkItemFields>; reason: string }
  | { op: "update"; kind: "goal"; id: string | Ref; base_version: number; fields: Partial<GoalFields>; reason?: string }
  | { op: "update"; kind: "work_item"; id: string | Ref; base_version: number; fields: Partial<WorkItemFields>; reason?: string }
  | { op: "comment"; kind: "goal" | "work_item"; id: string; text: string };

/** POST /api/commands. The commands run in order, in one transaction: every one is stored, or none is. */
export type CommandsRequest = { commands: ApiCommand[] };

/** A broken rule. `field` names the field it points to, when there is one. */
export type ApiViolation = { rule: string; message: string; field?: string };

/**
 * The answer to POST /api/commands. `at` is the index of the command that failed.
 * HTTP: 200 ok, 409 stale or exists, 422 invalid, 404 not_found, 400 bad_command, 403 unknown_actor.
 */
export type CommandsResponse =
  | { ok: true; ids: Record<Ref, string>; events: ApiEvent[] }
  | { ok: false; at: number; error: "stale"; current: StoredGoal | ApiWorkItem }
  | { ok: false; at: number; error: "invalid"; violations: ApiViolation[] }
  | { ok: false; at: number; error: "not_found" | "exists" | "bad_command" | "unknown_actor"; message: string };

/** GET /api/work, or GET /api/work?owner=<actor id> for one actor's queue. Every work item, or that actor's, with the goals and actors they name. */
export type WorkResponse = {
  me: ApiActor;
  today: string;
  items: ApiWorkItem[];
  goals: Record<string, GoalRef>;
  actors: Record<string, ApiActor>;
};
