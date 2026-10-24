import type { DatabaseSync } from "node:sqlite";
import type { FormOptions, PlanMaturity, WorkItemStatus } from "./api.ts";
import { DEFAULT_VISIBILITY } from "./goal.ts";
import { actorsById, workItemsOn } from "./goalpage.ts";
import { isCurrentPeriod } from "./priorities.ts";
import { read, readAll } from "./read.ts";
import { nextIds } from "./write.ts";

/**
 * What New goal, + Sub-goal, and + Work item offer (plan B3, design N1 to N16), with the defaults the server writes.
 * Choices are the SPEC.md §6.1 and §12 defaults until owner settings name others.
 */

const TYPES = ["Milestone (Commit)", "Milestone (Launch)", "Metric (Business)", "Metric (Customer)", "Metric (Operational Excellence)"];
const SEVERITIES = ["sev1", "sev2", "sev3"];
const LEVELS = ["Company", "Program or Function", "Team", "Individual"];
const PLAN_MATURITIES: PlanMaturity[] = ["Watercolor", "Crayon", "Pencil"];
const WORK_ITEM_STATUSES: WorkItemStatus[] = ["Backlog", "In Progress", "Completed", "Deleted"];

/** Enough keys for a goal, its Promotion Milestone, and a form full of sub-goals and their own milestones. */
const KEYS_AHEAD = 20;

export function formOptions(db: DatabaseSync, me: string, orgUnit: string, today: string): FormOptions {
  const unit = read(db, "org_unit", orgUnit);
  const level = (unit?.level as string) ?? LEVELS[0];
  const actors = actorsById(db);
  return {
    me: actors[me],
    today,
    orgUnit: { id: orgUnit, name: (unit?.name as string) ?? orgUnit, level },
    nextGoalKeys: nextIds(db, "goal", KEYS_AHEAD),
    actors: Object.values(actors),
    priorities: readAll(db, "priority")
      .filter((p) => p.org_unit === orgUnit && p.status === "Current" && isCurrentPeriod(p.period as string, today))
      .sort((a, b) => (a.rank as number) - (b.rank as number))
      .map((p) => ({ id: p.id as string, rank: p.rank as number, title: p.title as string })),
    defaults: {
      description: "",
      org_unit: orgUnit,
      level,
      type: "Milestone (Launch)",
      severity: "sev2",
      state: "In Progress",
      origination: "New",
      visibility: DEFAULT_VISIBILITY,
      // SPEC.md names no default plan maturity. The least firm is the honest start.
      plan_maturity: "Watercolor",
    },
    choices: { type: TYPES, severity: SEVERITIES, level: LEVELS, plan_maturity: PLAN_MATURITIES, workItemStatus: WORK_ITEM_STATUSES },
    workItems: workItemsOn(db),
  };
}
