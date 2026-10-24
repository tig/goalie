import type { ApiEvent, ApiWorkItem, WorkItemStatus } from "../../../src/api.ts";

/** The goal page's pure parts: work items by status (G23), the history filters, and how an Event's values read. */

/** Work items group in this order. Deleted items show only in History (G23). */
const STATUS_ORDER: WorkItemStatus[] = ["In Progress", "Backlog", "Completed"];

export function groupWorkItems<T extends Pick<ApiWorkItem, "status">>(items: T[]): { status: WorkItemStatus; items: T[] }[] {
  return STATUS_ORDER.map((status) => ({ status, items: items.filter((i) => i.status === status) })).filter((g) => g.items.length > 0);
}

export const HISTORY_FILTERS = ["All", "Dates", "Health", "State", "Comments"] as const;
export type HistoryFilter = (typeof HISTORY_FILTERS)[number];

const FIELDS: Record<Exclude<HistoryFilter, "All">, string[]> = {
  Dates: ["due_date", "changed_due_date", "date_type", "promotion_milestone", "original_committed_date"],
  Health: ["health", "path_to_green"],
  State: ["state"],
  Comments: ["comment"],
};

export const filterEvents = (events: ApiEvent[], filter: HistoryFilter) => (filter === "All" ? events : events.filter((e) => FIELDS[filter].includes(e.field)));

export const comments = (events: ApiEvent[]) => events.filter((e) => e.field === "comment");

/** An Event's old or new value in words: None for nothing, an actor by name, a Path to Green by its steps, links by their targets. */
export function eventValue(value: unknown, field?: string, actors?: Record<string, { name: string }>): string {
  if (value === null || value === undefined || value === "") return "None";
  if (field === "owner" && typeof value === "string" && actors?.[value]) return actors[value].name;
  if (Array.isArray(value)) return value.map((v) => (typeof v === "object" && v ? Object.values(v).join(" ") : String(v))).join(", ");
  if (typeof value === "object") {
    const steps = (value as { steps?: unknown[] }).steps;
    if (Array.isArray(steps)) return `Path to Green, ${steps.length} ${steps.length === 1 ? "step" : "steps"}`;
    return JSON.stringify(value);
  }
  return String(value);
}

/** SPEC.md §6.1 and §6.7 field names in words, for the History and the Fields card. */
const LABELS: Record<string, string> = {
  summary: "Summary", description: "Description", owner: "Owner", org_unit: "Org unit", level: "Level", type: "Type",
  due_date: "Due Date", date_type: "Date Type", promotion_milestone: "Promotion Milestone", plan: "Plan", plan_maturity: "Plan Maturity",
  work_product: "Work Product", changed_due_date: "Changed Due Date", severity: "Severity", priority: "Priority", state: "State",
  health: "Health", path_to_green: "Path to Green", origination: "Origination", parent: "Parent", visibility: "Visibility",
  original_committed_date: "Original Committed Date", committed_plan_version: "Committed Plan Version",
  comment: "Comment", title: "Title", status: "Status", goal: "Goal", links: "Links",
};

export const fieldLabel = (field: string) => LABELS[field] ?? field;

/**
 * The header's date bar (G6): where the start, today, and each date sit, in percent from the first of them to the last.
 * It is a picture of the dates above it, not a control.
 */
export function dateBar(started: string, today: string, dates: { date: string; kind: string }[]): { start: number; today: number; marks: { at: number; date: string; kind: string }[] } {
  const t = (d: string) => Date.parse(`${d}T00:00:00Z`);
  const from = Math.min(t(started), t(today), ...dates.map((d) => t(d.date)));
  const to = Math.max(from + 86_400_000, t(today), ...dates.map((d) => t(d.date)));
  const at = (d: string) => (100 * (t(d) - from)) / (to - from);
  return { start: at(started), today: at(today), marks: dates.map((d) => ({ at: at(d.date), date: d.date, kind: d.kind })) };
}
