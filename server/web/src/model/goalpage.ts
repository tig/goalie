import type { ApiActor, ApiEvent, ApiWorkItem, WorkItemStatus } from "../../../src/api.ts";
import { day, DAY, isDate } from "../../../src/dates.ts";
import { labelWidth } from "./timeline.ts";

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

const DATE_YEAR = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** What a value is named by: actors by id, and other ids (a Priority, an org unit, a goal) by name. */
export type Names = { actors?: Record<string, { name: string }>; names?: Record<string, string> };

/** An Event's old or new value in words: None for nothing, names for ids, a date with its year (rule 14), a Path to Green by its steps, links by their targets. */
export function eventValue(value: unknown, field?: string, ctx: Names = {}): string {
  if (value === null || value === undefined || value === "") return "None";
  if (typeof value === "string") {
    if (field === "owner" && ctx.actors?.[value]) return ctx.actors[value].name;
    if (ctx.names?.[value]) return ctx.names[value];
    const text: string = value;
    if (/^\d{4}-/.test(text) && isDate(text)) return DATE_YEAR.format(day(text));
    if (field === "visibility") return text.charAt(0).toUpperCase() + text.slice(1);
    return text;
  }
  if (Array.isArray(value)) return value.map((v) => (typeof v === "object" && v ? Object.values(v).join(" ") : String(v))).join(", ");
  if (typeof value === "object") {
    const steps = (value as { steps?: unknown[] }).steps;
    if (Array.isArray(steps)) return `Path to Green, ${steps.length} ${steps.length === 1 ? "step" : "steps"}`;
    return JSON.stringify(value);
  }
  return String(value);
}

/** The Events of one write: the same actor, time, entity, and reason. `created` is true when every old value is empty (a create). */
export type EventGroup = { events: ApiEvent[]; created: boolean };

/** History rows (design check): one row per write, newest first. A comment is always its own row. */
export function groupEvents(events: ApiEvent[]): EventGroup[] {
  const groups: EventGroup[] = [];
  for (const e of events) {
    const last = groups[groups.length - 1]?.events[0];
    const same = last && e.field !== "comment" && last.field !== "comment" && last.actor === e.actor && last.timestamp === e.timestamp && last.entity === e.entity && last.reason === e.reason;
    if (same) groups[groups.length - 1].events.push(e);
    else groups.push({ events: [e], created: false });
  }
  for (const g of groups) g.created = g.events.length > 1 && g.events.every((e) => e.old === null || e.old === undefined);
  return groups;
}

/** The actors who may own a goal or a Path to Green step: the humans. */
export const humans = (actors: Record<string, ApiActor> | ApiActor[]) => Object.values(actors).filter((a) => a.kind === "human");

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
  const t = day;
  const from = Math.min(t(started), t(today), ...dates.map((d) => t(d.date)));
  const to = Math.max(from + DAY, t(today), ...dates.map((d) => t(d.date)));
  const at = (d: string) => (100 * (t(d) - from)) / (to - from);
  return { start: at(started), today: at(today), marks: dates.map((d) => ({ at: at(d.date), date: d.date, kind: d.kind })) };
}

/** Date bar labels (G6): each label's row, 0 or 1. A label that would touch the one before it in its row drops to the other row. `width` is the bar in pixels. */
export function labelRows(labels: { at: number; text: string; align: "start" | "center" | "end" }[], width: number): number[] {
  const gap = 8;
  const ends = [-Infinity, -Infinity];
  return labels.map((l) => {
    const w = labelWidth(l.text);
    const x = (l.at / 100) * width;
    const left = l.align === "start" ? x : l.align === "end" ? x - w : x - w / 2;
    const row = left >= ends[0] + gap ? 0 : left >= ends[1] + gap ? 1 : 0;
    ends[row] = left + w;
    return row;
  });
}

/** The team view (plan F6): one queue per owner, people with work In Progress first; each queue by status. Deleted items are left out. */
export function queues<T extends Pick<ApiWorkItem, "owner" | "status">>(items: T[], actors: Record<string, ApiActor>, me: string) {
  const owners = [...new Set(items.filter((i) => i.status !== "Deleted").map((i) => i.owner))];
  const actor = (id: string): ApiActor => actors[id] ?? { id, name: id, kind: "human" };
  // What is happening now comes first: people with work In Progress, then the signed-in actor, then everyone else; by name within each.
  const busy = (id: string) => items.some((i) => i.owner === id && i.status === "In Progress");
  const rank = (q: { owner: ApiActor }) => (busy(q.owner.id) ? 0 : q.owner.id === me ? 1 : 2);
  return owners
    .map((id) => ({ owner: actor(id), groups: groupWorkItems(items.filter((i) => i.owner === id)) }))
    .sort((a, b) => rank(a) - rank(b) || a.owner.name.localeCompare(b.owner.name));
}
