import type { DatabaseSync } from "node:sqlite";
import { ENTITIES, encode, isKind, lookup, memoryLookup, read, readAll, readEvents, type EventRow, type Kind } from "./read.ts";
import { checkTransition, checkWrite, REASONED, summaryLint, SYSTEM_FIELDS, type Row, type Violation } from "./rules.ts";

/**
 * The one write path. The API, the MCP server, the app, and the seed call write(). Nothing else writes.
 * A write appends its Events and updates the current row in one transaction, or does neither (ADR 0002).
 */

/** Reads moved to read.ts. These names stay exported here until every caller imports read.ts. */
export { isKind, read, readEvents, type EventRow, type Kind };

/** Values a create fills when the command leaves them out (SPEC.md §6.1, §12). */
const DEFAULTS: Partial<Record<Kind, Row>> = {
  goal: { description: "", visibility: "organization-wide" },
  user_settings: { favorite_views: [], appearance: "light" },
};

export type Command =
  | { op: "create"; kind: Kind; id?: string; fields: Row; reason?: string }
  | { op: "update"; kind: Kind; id: string; base_version: number; fields: Row; reason?: string };

export type WriteResult =
  | { ok: true; entity: Row; events: EventRow[] }
  | { ok: false; error: "stale"; current: Row }
  | { ok: false; error: "invalid"; violations: Violation[] }
  | { ok: false; error: "unknown_actor" | "not_found" | "exists" | "bad_command"; message: string };

function nextId(db: DatabaseSync, kind: Kind): string {
  const { n } = db.prepare(`SELECT COUNT(*) AS n FROM ${kind}`).get() as { n: number };
  for (let i = n + 1; ; i++) {
    const id = `${ENTITIES[kind].prefix}-${i}`;
    if (read(db, kind, id) === undefined) return id;
  }
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
export function write(db: DatabaseSync, actor: string, command: Command): WriteResult {
  if (!isKind(command.kind)) return badCommand(`unknown kind ${String(command.kind)}`);
  const kind = command.kind;
  const spec = ENTITIES[kind];
  const fields = command.fields ?? {};
  const unknown = Object.keys(fields).filter((f) => !(spec.fields as readonly string[]).includes(f));
  if (unknown.length > 0) return badCommand(`unknown fields for ${kind}: ${unknown.join(", ")}`);
  const system = Object.keys(fields).filter((f) => (SYSTEM_FIELDS[kind] ?? []).includes(f));
  if (system.length > 0) {
    return { ok: false, error: "invalid", violations: system.map((f) => ({ rule: "system-field", message: `${f} is set by the system.` })) };
  }

  db.exec("BEGIN IMMEDIATE");
  db.exec("PRAGMA defer_foreign_keys = ON");
  try {
    const result = apply(db, actor, kind, command, fields);
    db.exec(result.ok ? "COMMIT" : "ROLLBACK");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function apply(db: DatabaseSync, actor: string, kind: Kind, command: Command, fields: Row): WriteResult {
  const spec = ENTITIES[kind];
  const id = command.id ?? nextId(db, kind);
  const before = read(db, kind, id);
  if (read(db, "actor", actor) === undefined && !bootstraps(db, actor, kind, id, fields)) {
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
  } else {
    return badCommand("op must be create or update");
  }
  applySystemFields(db, kind, after);

  const changed = spec.fields.filter((f) => !same(before?.[f], after[f]));
  if (before !== undefined && changed.length === 0) return { ok: true, entity: before, events: [] };

  const reason = command.reason?.trim() || null;
  const violations: Violation[] = checkTransition(kind, before, after);
  const needReason = changed.filter((f) => (REASONED[kind] ?? []).includes(f));
  if (needReason.length > 0 && reason === null) {
    violations.push({ rule: "reason-required", message: `a change to ${needReason.join(", ")} needs a reason.` });
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
    return { ok: false, error: "invalid", violations: [...violations, { rule: "field-value", message }] };
  }
  violations.push(...missingReferences(db, kind));
  violations.push(...checkWrite(lookup(db), kind, read(db, kind, id) as Row));
  if (violations.length > 0) return { ok: false, error: "invalid", violations };

  const timestamp = new Date().toISOString();
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

/** Foreign keys are deferred inside the transaction, so a missing reference becomes a named violation. */
function missingReferences(db: DatabaseSync, kind: Kind): Violation[] {
  const rows = db.prepare(`PRAGMA foreign_key_check(${kind})`).all() as { parent: string }[];
  return rows.map((r) => ({ rule: "reference-exists", message: `${kind} names a ${r.parent} that does not exist.` }));
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
  const lints = rows.goal.map(summaryLint).filter((l): l is string => l !== undefined);
  return { goals: rows.goal.length, violations: unique, lints };
}
