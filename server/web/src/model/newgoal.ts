import type { CommandsRequest, CommandsResponse } from "../../../src/api.ts";
import { createBatch, refusals, type NewGoalForm } from "./commands.ts";
import { fieldLabel } from "./goalpage.ts";

/**
 * New goal v2 (docs/design/goal-page-and-create.md, NF1 to NF18): what the rail and the cards say.
 * The browser checks no rule (ADR 0010). Whether a field has a value is the form's; every rule is the server's dry-run answer, mapped here to plain words.
 */

/** The form's parts that this module reads. A form from a parent (NF9) takes the parent's date, so it has no date of its own to fill. */
export type Foundation = Pick<NewGoalForm, "summary" | "owner" | "due_date" | "date_type" | "milestone" | "subGoals" | "workItems"> & {
  parent?: string | null;
  /** NF4a: a Priority, or None, was chosen. Priority has no default, so leaving it untouched is not a choice. */
  priorityPicked?: boolean;
};

export type SaveLine = { key: string; text: string; done: boolean; sentence: string };

/** Each key's checklist line and the sentence it shows at its field after a press (NF14, NF15). */
const WORDS: Record<string, [string, string]> = {
  summary: ["Summary", "Write a summary."],
  due_date: ["Date", "Choose a date."],
  date_type: ["Date Type", "Choose how firm the date is."],
  milestone_date: ["Promotion Milestone date", "Pick a Committed date between tomorrow and this goal's date."],
  milestone: ["Promotion Milestone", "The Promotion Milestone needs a summary and a human owner."],
  plan_maturity: ["Plan at Pencil", "A Committed date needs a plan at Pencil."],
  priority: ["Priority, or None", "Choose a Priority, or None. With None, it will not show on Priorities."],
  owner: ["Owner", "Choose one human owner."],
  health: ["Health", "An In Progress goal needs a health: GREEN, YELLOW, or RED."],
  path_to_green: ["Path to Green", "A YELLOW or RED goal needs a Path to Green: a step with an owner and a date, and criteria for GREEN."],
};

/** Keys that belong to the Details card: they show only once it is opened and changed (NF14). */
const DETAIL = /^(state|health|path_to_green|type|severity|origination|visibility|work_product|description|sub:\d+|workitem:\d+)$/;

const uncommitted = (f: Foundation) => f.date_type === "Ambition" || f.date_type === "Fantasy";

/** The key a server refusal belongs to, from the command it names and its field. */
function keyOf(place: string, field: string | undefined, rule: string): string {
  if (place === "milestone") return field === "due_date" || rule === "promotion-milestone" ? "milestone_date" : "milestone";
  if (place.startsWith("sub:") || place.startsWith("workitem:")) return place;
  if (field === "promotion_milestone") return "milestone_date";
  return field ?? rule;
}

function words(key: string): [string, string] {
  if (WORDS[key]) return WORDS[key];
  const [kind, n] = key.split(":");
  if (n !== undefined) return [`${kind === "sub" ? "Sub-goal" : "Work item"} ${Number(n) + 1}`, `${kind === "sub" ? "This sub-goal" : "This work item"} needs a change before it can be saved.`];
  return [fieldLabel(key), `${fieldLabel(key)} needs a change before it can be saved.`];
}

/**
 * NF14 to NF16: "To save", one line per thing the foundation still needs, all at once.
 * `answer` is the latest dry run, or null before the form is complete enough to ask. `details` is true once the Details card is opened and changed.
 */
export function toSave(form: Foundation, answer: CommandsResponse | null, details: boolean, batch?: CommandsRequest): SaveLine[] {
  // The batch only places each refusal on its command; a bare form gets the fields that shape it.
  const sent = batch ?? createBatch({ description: "", priority: null, health: null, path_to_green: null, plan: null, plan_maturity: "Watercolor", milestoneType: "", more: {}, ...form } as unknown as NewGoalForm);
  const refused = answer && !answer.ok ? refusals(answer, sent) : [];
  const keys = new Set(refused.map((v) => keyOf(v.place, v.field, v.rule)));
  const line = (key: string, filled: boolean): SaveLine => {
    const [text, sentence] = words(key);
    return { key, text, done: filled && !keys.has(key), sentence };
  };
  const lines = [line("summary", Boolean(form.summary.trim()))];
  if (!form.parent) {
    lines.push(line("due_date", Boolean(form.due_date)), line("date_type", Boolean(form.date_type)));
    if (uncommitted(form)) lines.push(line("milestone_date", Boolean(form.milestone?.due_date)));
    if (form.date_type === "Committed") lines.push(line("plan_maturity", answer !== null));
    lines.push(line("priority", Boolean(form.priorityPicked)));
  }
  const shown = new Set(lines.map((l) => l.key));
  for (const key of keys) {
    if (shown.has(key) || (!details && DETAIL.test(key))) continue;
    lines.push(line(key, false));
    shown.add(key);
  }
  return lines;
}

/** Whether a command's refusal is on the foundation card or the Details card, for scrolling to the first unmet field. */
export const placeOf = (key: string) => (DETAIL.test(key) ? "details" : key);

/** NF14: "Create will make", without keys: keys follow the server's create order and change as the form changes (NF17). */
export function makes(form: Foundation): string {
  const n = (k: number, word: string) => `${k} ${word}${k === 1 ? "" : "s"}`;
  return [
    "This goal",
    !form.parent && uncommitted(form) ? "its Promotion Milestone" : "",
    form.subGoals.length ? n(form.subGoals.length, "sub-goal") : "",
    form.workItems.length ? n(form.workItems.length, "work item") : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** NF10: the closed Details card shows five of its values, then how many more. */
export function detailsLine(rows: [string, string][]): string {
  const shown = rows.slice(0, 5).map(([label, value]) => `${label} · ${value}`);
  return [...shown, ...(rows.length > 5 ? [`and ${rows.length - 5} more`] : [])].join("   ");
}

