import type { DatabaseSync } from "node:sqlite";
import type { Row } from "./rules.ts";
import { write, type Command } from "./write.ts";

/**
 * The Excaliwire seed: the org unit, Tig and Chelsea, and the goal tree on #47 (tig/goalie).
 * Every row goes through the write path, as Chelsea, who runs the load.
 * Values marked "Placeholder" are not in #47. The pull request for #48 lists them for Tig.
 */

const REASON = "Seeded from tig/goalie#47 (XW-0003 MLP)";
const ISSUES = "https://github.com/tig/goalie/issues";

const goal = (fields: Row): Row => ({
  org_unit: "excaliwire",
  level: "Company",
  severity: "sev1",
  origination: "New",
  ...fields,
});

/** Placeholder until Tig writes the real Path to Green. A step has a named owner and a date. */
const placeholderPtg = (trigger?: string): Row => ({
  steps: [{ owner: "tig", date: "2026-10-29", text: "Placeholder: Tig writes the Path to Green" }],
  criteria: "Placeholder: Tig writes the criteria for returning to GREEN",
  ...(trigger ? { trigger } : {}),
});

const PLACEHOLDER_PLAN = "Placeholder: Tig links the plan";

/** Excaliwire's Priorities for 2026-Q4. Placeholder: the order is the v1 canvas Home board's. Tig ranks them. */
const priority = (id: string, rank: number, title: string, cutLine = false): Command => ({
  op: "create",
  kind: "priority",
  id,
  reason: `${REASON}. Placeholder: Tig ranks the Priorities.`,
  fields: { org_unit: "excaliwire", period: "2026-Q4", rank, title, status: "Current", ...(cutLine ? { cut_line: "true" } : {}) },
});

const subGoal = (id: string, summary: string, plan: string, state = "Backlog"): Command => ({
  op: "create",
  kind: "goal",
  id,
  reason: REASON,
  fields: goal({
    summary,
    description: "An MLP sub-goal on tig/goalie#47.",
    owner: "chelsea",
    type: "Milestone (Launch)",
    due_date: "2026-11-06",
    date_type: "Committed",
    plan,
    plan_maturity: "Pencil",
    state,
    ...(state === "In Progress" ? { health: "GREEN" } : {}),
    parent: "XW-0004",
  }),
});

const COMMANDS: Command[] = [
  { op: "create", kind: "actor", id: "chelsea", reason: REASON, fields: { kind: "human", display_name: "Chelsea" } },
  { op: "create", kind: "actor", id: "tig", reason: REASON, fields: { kind: "human", display_name: "Tig" } },
  { op: "create", kind: "owner_settings", id: "owner", reason: REASON, fields: { owner: "tig", settings: {} } },
  { op: "create", kind: "org_unit", id: "excaliwire", reason: REASON, fields: { name: "Excaliwire", level: "Company", owner: "tig" } },
  priority("PRI-1", 1, "Regenerate the E28 canon"),
  priority("PRI-2", 2, "Grow the XW team"),
  priority("PRI-3", 3, "Run Excaliwire on GOALIE", true),
  {
    op: "create",
    kind: "goal",
    id: "XW-0001",
    reason: REASON,
    fields: goal({
      priority: "PRI-1",
      summary: "Regenerate the E28 canon by Oct 1",
      owner: "tig",
      type: "Milestone (Launch)",
      due_date: "2026-10-01",
      date_type: "Committed",
      plan: PLACEHOLDER_PLAN,
      plan_maturity: "Pencil",
      state: "In Progress",
      health: "RED",
      path_to_green: placeholderPtg(),
    }),
  },
  {
    op: "create",
    kind: "goal",
    id: "XW-0002",
    reason: REASON,
    fields: goal({
      priority: "PRI-2",
      summary: "Add two more humans to XW by Nov 15",
      owner: "tig",
      type: "Milestone (Launch)",
      due_date: "2026-11-15",
      date_type: "Committed",
      plan: PLACEHOLDER_PLAN,
      plan_maturity: "Pencil",
      severity: "sev2",
      state: "In Progress",
      health: "YELLOW",
      path_to_green: placeholderPtg("Placeholder: Tig names the trigger that turns this RED"),
    }),
  },
  {
    op: "create",
    kind: "goal",
    id: "XW-0004",
    reason: REASON,
    fields: goal({
      summary: "Run the MLP prototype at goalie.excaliwire.com with Excaliwire's real goals loaded",
      description: "The Promotion Milestone for XW-0003. Held in tig/goalie#47 until GOALIE holds it.",
      owner: "chelsea",
      type: "Milestone (Commit)",
      due_date: "2026-11-06",
      date_type: "Committed",
      plan: "docs/release-plan.md",
      plan_maturity: "Pencil",
      work_product: [
        { repo: "github.com/tig/goalie" },
        { url: "https://goalie.excaliwire.com" },
        { doc: "https://claude.ai/artifact/KL6KBcJMeBMG3Cr7bPWyMk" },
      ],
      state: "In Progress",
      health: "GREEN",
    }),
  },
  {
    op: "create",
    kind: "goal",
    id: "XW-0003",
    reason: REASON,
    fields: goal({
      priority: "PRI-3",
      summary: "Tig, Chelsea, and agents use GOALIE to drive Excaliwire execution",
      owner: "chelsea",
      type: "Milestone (Launch)",
      due_date: "2026-11-30",
      date_type: "Fantasy",
      promotion_milestone: "XW-0004",
      plan: "docs/release-plan.md",
      plan_maturity: "Crayon",
      state: "In Progress",
      health: "GREEN",
    }),
  },
  { op: "update", kind: "goal", id: "XW-0004", base_version: 1, reason: REASON, fields: { parent: "XW-0003" } },
  subGoal("XW-0005", "Stand up the spine: store, rules, sign-in, event log", `${ISSUES}/48`, "In Progress"),
  subGoal("XW-0006", "Show Priorities as Home, on a timeline", `${ISSUES}/49`),
  subGoal("XW-0007", "Open a goal and keep it true", `${ISSUES}/50`),
  subGoal("XW-0008", "Create a goal or a sub-goal", "docs/release-plan.md"),
  subGoal("XW-0009", "Let an agent work in GOALIE: API, MCP, Drafts", "docs/release-plan.md"),
  subGoal("XW-0010", "Draft health from GitHub with the evidence", "docs/release-plan.md"),
  subGoal("XW-0011", "Load Excaliwire's goals and release", "docs/release-plan.md"),
];

export type SeedResult = { ok: true; events: number } | { ok: false; reason: string; command?: Command; result?: unknown };

/** Load the seed into an empty store. Stop at the first rejected write. */
export function seed(db: DatabaseSync): SeedResult {
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM actor").get() as { n: number };
  if (n > 0) return { ok: false, reason: "the store is not empty" };
  let events = 0;
  for (const command of COMMANDS) {
    const result = write(db, "chelsea", command);
    if (!result.ok) return { ok: false, reason: "a seed write was rejected", command, result };
    events += result.events.length;
  }
  return { ok: true, events };
}
