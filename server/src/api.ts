/**
 * The JSON contract between the server and the React app (ADR 0003, ADR 0010).
 * The server builds these values from the store. The app draws them and holds no rule.
 * Dates are ISO strings (YYYY-MM-DD). Labels are made in the app.
 */

export type Health = "GREEN" | "YELLOW" | "RED" | null;

/** How firm a date is (SPEC.md §5). A Promotion Milestone date is a Committed date that backs another goal's uncommitted date. */
export type DateKind = "Committed" | "Promotion Milestone" | "Ambition" | "Fantasy";

/** One date of a goal. `slipDays` is set when a Committed date has passed while the goal is open. */
export type GoalDate = { date: string; kind: DateKind; slipDays?: number };

export type ActorRef = { id: string; name: string };

/** The first step of a Path to Green (SPEC.md §6.1). */
export type PtgStep = { text: string; owner?: ActorRef; date?: string };

export type ApiGoal = {
  id: string;
  summary: string;
  owner: ActorRef;
  state: string;
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
  slips: { goal: string; summary: string; date: string; days: number }[];
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
