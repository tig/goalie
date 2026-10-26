import type { DatabaseSync } from "node:sqlite";
import { ENTITIES, encode, goalieOwner, isKind, lookup, memoryLookup, read, readAll, readEvents, type EventRow, type Kind } from "./read.ts";
import { DEFAULT_VISIBILITY, isOpen } from "./goal.ts";
import { checkAuthor, checkTransition, checkWrite, goalLints, REASONED_KINDS, SYSTEM_FIELDS, type Row, type Violation } from "./rules.ts";

/**
 * The one write path. The API, the MCP server, the app, and the seed call write(). Nothing else writes.
 * A write appends its Events and updates the current row in one transaction, or does neither (ADR 0002).
 */

/** Values a create fills when the command leaves them out (SPEC.md §6.1, §12). The one home: options.ts offers them as the form's defaults. */
export const DEFAULTS: Partial<Record<Kind, Row>> = {
  // A new goal starts at Backlog (NF8, N-F3). SPEC.md names no default plan maturity; the least firm is the honest start.
  goal: { description: "", visibility: DEFAULT_VISIBILITY, type: "Milestone (Launch)", severity: "sev2", state: "Backlog", origination: "New", plan_maturity: "Watercolor" },
  user_settings: { favorite_views: [], appearance: "light" },
};

export type Command =
  | { op: "create"; kind: Kind; id?: string; fields: Row; reason?: string }
  | { op: "update"; kind: Kind; id: string; base_version: number; fields: Row; reason?: string }
  | { op: "comment"; kind: Kind; id: string; text: string };

export type WriteResult =
  | { ok: true; entity: Row; events: EventRow[] }
  | { ok: false; error: "stale"; current: Row }
  | { ok: false; error: "invalid"; violations: Violation[] }
  | { ok: false; error: "unknown_actor" | "not_found" | "exists" | "bad_command"; message: string };

/**
 * The next unused key: a prefix and a 4-digit number, e.g. XW-0012 or WI-0001 (plan E-3).
 * The GOALIE owner sets the prefix as `goal_key_prefix` in owner settings (SPEC.md §6.1, §12). The default is the kind's prefix in read.ts.
 */
function nextId(db: DatabaseSync, kind: Kind): string {
  return nextIds(db, kind, 1)[0];
}

/** The next `count` unused keys, in the order creates would take them. New goal shows them before it saves (design N11, N12). */
export function nextIds(db: DatabaseSync, kind: Kind, count: number): string[] {
  const settings = kind === "goal" ? (read(db, "owner_settings", "owner")?.settings as Row | undefined) : undefined;
  const prefix = typeof settings?.goal_key_prefix === "string" ? settings.goal_key_prefix : ENTITIES[kind].prefix;
  const { n } = db.prepare(`SELECT COUNT(*) AS n FROM ${kind}`).get() as { n: number };
  const ids: string[] = [];
  for (let i = n + 1; ids.length < count; i++) {
    const id = `${prefix}-${kind === "goal" || kind === "work_item" ? String(i).padStart(4, "0") : i}`;
    if (read(db, kind, id) === undefined) ids.push(id);
  }
  return ids;
}

/** A field holds text, a number, or null. A `bool` field holds a boolean. A `json` field holds any JSON value. */
function wrongTypes(kind: Kind, fields: Row): Violation[] {
  const spec = ENTITIES[kind];
  return Object.entries(fields)
    .filter(([field, value]) => {
      if (value === null || (spec.json as readonly string[]).includes(field)) return false;
      if ((spec.bool as readonly string[]).includes(field)) return typeof value !== "boolean";
      return typeof value !== "string" && !(typeof value === "number" && Number.isFinite(value));
    })
    .map(([field, value]) => ({ rule: "field-value", message: `${kind}.${field} cannot hold ${JSON.stringify(value)}.`, field }));
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Fill the fields only the system sets. A goal that first becomes Committed records its date and plan version. */
function applySystemFields(db: DatabaseSync, kind: Kind, row: Row): void {
  if (kind !== "goal" || row.date_type !== "Committed" || row.original_committed_date != null) return;
  row.original_committed_date = row.due_date;
  const plan = typeof row.plan === "string" ? read(db, "doc", row.plan) : undefined;
  if (plan !== undefined) row.committed_plan_version = plan.version;
}

function badCommand(message: string): WriteResult {
  return { ok: false, error: "bad_command", message };
}

/** Apply one command as `actor`. Every invariant is checked on the committed result, in the transaction. */
const isObject = (value: unknown): value is Row => typeof value === "object" && value !== null && !Array.isArray(value);

/** `today` is the org's day, from the caller: a route or the CLI reads configuration, the write path does not (Head of Engineering). */
/** `at` is the Events' timestamp: a batch passes one for all its commands, so one save is one time in History. */
/** `defer` names store rules a batch checks once it ends instead, such as no-rank-ties while a re-rank swaps two ranks. */
export function write(db: DatabaseSync, actor: string, command: Command, today: string, at: string = new Date().toISOString(), defer: readonly string[] = []): WriteResult {
  if (!isObject(command)) return badCommand("a command is a JSON object");
  if (!isKind(command.kind)) return badCommand(`unknown kind ${String(command.kind)}`);
  const kind = command.kind;
  if (command.op === "comment") return inTransaction(db, (result) => result.ok, () => comment(db, actor, kind, command.id, command.text, at));
  if (command.fields !== undefined && !isObject(command.fields)) return badCommand("fields is a JSON object");
  const spec = ENTITIES[kind];
  const fields = command.fields ?? {};
  const unknown = Object.keys(fields).filter((f) => !(spec.fields as readonly string[]).includes(f));
  if (unknown.length > 0) return badCommand(`unknown fields for ${kind}: ${unknown.join(", ")}`);
  const system = Object.keys(fields).filter((f) => (SYSTEM_FIELDS[kind] ?? []).includes(f));
  if (system.length > 0) {
    return { ok: false, error: "invalid", violations: system.map((f) => ({ rule: "system-field", message: `${f} is set by the system.`, field: f })) };
  }

  if (command.op === "update" && !Number.isInteger(command.base_version)) return badCommand("base_version must be a whole number");

  const typed = wrongTypes(kind, fields);
  if (typed.length > 0) return { ok: false, error: "invalid", violations: typed };

  return inTransaction(db, (result) => result.ok, () => apply(db, actor, kind, command, fields, today, at, defer));
}

/**
 * Run `body` in one transaction: commit when `keep` says so, else roll back.
 * Inside an open transaction it is a savepoint, so a caller can group several writes (the seed does).
 */
export function inTransaction<T>(db: DatabaseSync, keep: (result: T) => boolean, body: () => T): T {
  const nested = db.isTransaction;
  db.exec(nested ? "SAVEPOINT write" : "BEGIN IMMEDIATE");
  db.exec("PRAGMA defer_foreign_keys = ON");
  const undo = () => db.exec(nested ? "ROLLBACK TO write; RELEASE write" : "ROLLBACK");
  try {
    const result = body();
    if (keep(result)) db.exec(nested ? "RELEASE write" : "COMMIT");
    else undo();
    return result;
  } catch (error) {
    undo();
    throw error;
  }
}

function apply(db: DatabaseSync, actor: string, kind: Kind, command: Command, fields: Row, today: string, at: string, defer: readonly string[]): WriteResult {
  const spec = ENTITIES[kind];
  const id = command.id ?? nextId(db, kind);
  const before = read(db, kind, id);
  const author = read(db, "actor", actor);
  if (author === undefined && !bootstraps(db, actor, kind, id, fields)) {
    return { ok: false, error: "unknown_actor", message: `no actor ${actor}` };
  }

  let after: Row;
  if (command.op === "create") {
    if (before !== undefined) return { ok: false, error: "exists", message: `${kind} ${id} exists` };
    after = { id, version: 1, ...DEFAULTS[kind], ...fields };
  } else if (command.op === "update") {
    if (before === undefined) return { ok: false, error: "not_found", message: `no ${kind} ${id}` };
    if (command.base_version !== before.version) return { ok: false, error: "stale", current: before };
    after = { ...before, ...fields, version: (before.version as number) + 1 };
    // D3, Codebase QA P4: health is kept while In Progress (SPEC.md §6.1). A close clears it; its Event keeps the old health in History.
    if (kind === "goal" && before.state === "In Progress" && !isOpen(after)) after.health = null;
  } else {
    return badCommand("op must be create or update");
  }
  applySystemFields(db, kind, after);
  // A blank text is missing too (Codebase QA).
  const missing = requiredFields(db, kind).filter((f) => after[f] == null || (typeof after[f] === "string" && (after[f] as string).trim() === "" && f !== "description"));

  const changed = spec.fields.filter((f) => !same(before?.[f], after[f]));
  if (before !== undefined && changed.length === 0) return { ok: true, entity: before, events: [] };

  const reason = command.reason?.trim() || null;
  const violations: Violation[] = [...(author ? checkAuthor(author, goalieOwner(db), kind, before, after, lookup(db)) : []), ...checkTransition(kind, before, after, today, (id) => read(db, "goal", id))];
  const needReason = REASONED_KINDS.includes(kind) ? changed : [];
  if (needReason.length > 0 && reason === null) {
    violations.push({ rule: "reason-required", message: `a change to ${needReason.map(fieldWords).join(", ")} needs a reason.`, field: "reason" });
  }
  if (missing.length > 0) {
    // The row cannot be stored, but the rules still run on it, so one refusal names every rule it breaks (Product Designer's check).
    const rest = checkWrite(lookup(db), kind, after).filter((v) => v.field === undefined || !missing.includes(v.field));
    return { ok: false, error: "invalid", violations: [...missing.map((f) => ({ rule: "required-field", message: `${fieldWords(f)} is required.`, field: f })), ...violations, ...rest] };
  }

  const columns = ["version", ...spec.fields];
  const values = columns.map((c) => encode(kind, c, after[c]));
  try {
    if (before === undefined) {
      db.prepare(`INSERT INTO ${kind} (id, ${columns.join(", ")}) VALUES (?, ${columns.map(() => "?").join(", ")})`).run(id, ...values);
    } else {
      db.prepare(`UPDATE ${kind} SET ${columns.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`).run(...values, id);
    }
  } catch (error) {
    // The schema holds the required fields and the enum values. Its refusal is a named rejection.
    const message = error instanceof Error ? error.message : String(error);
    if (!/constraint failed/i.test(message)) throw error;
    // A rule that names the cause comes before the raw text (Codebase QA P6: one-actor-per-sign-in, not "UNIQUE constraint failed").
    const named = checkWrite(lookup(db), kind, after);
    return { ok: false, error: "invalid", violations: [...violations, ...(named.length > 0 ? named : [{ rule: "field-value", message }])] };
  }
  violations.push(...missingReferences(db, kind, id));
  violations.push(...checkWrite(lookup(db), kind, read(db, kind, id) as Row).filter((v) => !defer.includes(v.rule)));
  if (violations.length > 0) return { ok: false, error: "invalid", violations };

  const timestamp = at;
  const append = db.prepare(
    "INSERT INTO event (timestamp, actor, entity_kind, entity, field, old, new, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  let first = 0;
  for (const field of changed) {
    const old = before?.[field] ?? null;
    const now = after[field] ?? null;
    const { lastInsertRowid } = append.run(
      timestamp, actor, kind, id, field,
      old === null ? null : JSON.stringify(old),
      now === null ? null : JSON.stringify(now),
      reason,
    );
    if (first === 0) first = Number(lastInsertRowid) - 1;
  }
  return { ok: true, entity: read(db, kind, id) as Row, events: readEvents(db, first) };
}

/** A field key in SPEC.md words, for a message people read: plan_maturity is "Plan Maturity". */
const fieldWords = (field: string) => field.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

/** The fields the schema holds NOT NULL with no default. A row without one is a named rejection, not SQLite's text. */
function requiredFields(db: DatabaseSync, kind: Kind): string[] {
  const columns = db.prepare(`PRAGMA table_info(${kind})`).all() as { name: string; notnull: number; dflt_value: unknown; pk: number }[];
  return columns.filter((c) => c.notnull === 1 && c.dflt_value === null && c.pk === 0 && c.name !== "version").map((c) => c.name);
}

/** A comment is read on every page load and sent over every open stream (Codebase QA). */
const MAX_COMMENT = 10_000;

/** A comment is one Event on its entity: field "comment", old null, the text as new and as reason. No row changes (SPEC.md §6.6, plan E-4). */
function comment(db: DatabaseSync, actor: string, kind: Kind, id: string, text: unknown, at: string): WriteResult {
  if (read(db, "actor", actor) === undefined) return { ok: false, error: "unknown_actor", message: `no actor ${actor}` };
  if (typeof id !== "string" || read(db, kind, id) === undefined) return { ok: false, error: "not_found", message: `no ${kind} ${String(id)}` };
  if (typeof text !== "string" || text.trim() === "" || text.length > MAX_COMMENT) {
    return { ok: false, error: "invalid", violations: [{ rule: "comment-text", message: `a comment has text, at most ${MAX_COMMENT} characters.`, field: "text" }] };
  }
  const body = text.trim();
  const { lastInsertRowid } = db
    .prepare("INSERT INTO event (timestamp, actor, entity_kind, entity, field, old, new, reason) VALUES (?, ?, ?, ?, 'comment', NULL, ?, ?)")
    .run(at, actor, kind, id, JSON.stringify(body), body);
  return { ok: true, entity: read(db, kind, id) as Row, events: readEvents(db, Number(lastInsertRowid) - 1) };
}

/** Foreign keys are deferred inside the transaction, so a missing reference becomes a named violation. Only the written row is checked. */
function missingReferences(db: DatabaseSync, kind: Kind, id: string): Violation[] {
  const keys = db.prepare(`PRAGMA foreign_key_list(${kind})`).all() as { table: string; from: string; to: string }[];
  const row = db.prepare(`SELECT * FROM ${kind} WHERE id = ?`).get(id) as Row;
  return keys
    .filter((k) => row[k.from] != null && db.prepare(`SELECT 1 FROM ${k.table} WHERE ${k.to} = ?`).get(row[k.from] as string) === undefined)
    .map((k) => ({ rule: "reference-exists", message: `${kind} names a ${k.table} that does not exist.`, field: k.from }));
}

/** The first write to an empty store creates the acting human. It is the only write by an actor that does not exist yet. */
function bootstraps(db: DatabaseSync, actor: string, kind: Kind, id: string, fields: Row): boolean {
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM actor").get() as { n: number };
  return n === 0 && kind === "actor" && id === actor && fields.kind === "human";
}

/** Re-run every rule and lint over the whole store. Invalid records stay visible (SPEC.md §8.1). */
export function checkStore(db: DatabaseSync): { goals: number; violations: Violation[]; lints: string[] } {
  const rows = { actor: readAll(db, "actor"), org_unit: readAll(db, "org_unit"), priority: readAll(db, "priority"), goal: readAll(db, "goal") };
  const store = memoryLookup(rows);
  const violations = (["actor", "org_unit", "priority", "goal"] as const).flatMap((kind) => rows[kind].flatMap((row) => checkWrite(store, kind, row)));
  const unique = [...new Map(violations.map((v) => [`${v.rule} ${v.message}`, v])).values()];
  const lints = rows.goal.flatMap((g) => goalLints(g).filter((h) => h.field === "summary").map((h) => `${g.id}: ${h.text}`));
  return { goals: rows.goal.length, violations: unique, lints };
}
