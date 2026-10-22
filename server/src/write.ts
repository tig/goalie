import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { checkTransition, checkWrite, REASONED, SYSTEM_FIELDS, type Lookup, type Row, type Violation } from "./rules.ts";

/**
 * The one write path. The API, the MCP server, the app, and the seed call write(). Nothing else writes.
 * A write appends its Events and updates the current row in one transaction, or does neither (ADR 0002).
 */

/** The writable fields of each entity (SPEC.md §6). `json` fields hold structured values. */
const ENTITIES = {
  actor: { prefix: "ACTOR", fields: ["kind", "display_name", "operator", "email", "subject", "app_id"], json: [] },
  org_unit: { prefix: "OU", fields: ["name", "level", "parent", "owner"], json: [] },
  priority: { prefix: "PRI", fields: ["org_unit", "period", "rank", "title", "description", "cut_line", "status"], json: [] },
  doc: { prefix: "DOC", fields: ["kind", "title", "body"], json: [] },
  goal: {
    prefix: "GOAL",
    fields: [
      "summary", "description", "owner", "org_unit", "level", "type", "due_date", "date_type",
      "promotion_milestone", "plan", "committed_plan_version", "plan_maturity", "work_product",
      "original_committed_date", "changed_due_date", "severity", "priority", "state", "health",
      "path_to_green", "origination", "parent", "visibility",
    ],
    json: ["work_product", "path_to_green"],
  },
  work_item: { prefix: "WI", fields: ["goal", "title", "owner", "status", "due_date", "links"], json: ["links"] },
  draft: { prefix: "DRAFT", fields: ["entity", "actor", "base_version", "change", "reason"], json: ["change"] },
  owner_settings: { prefix: "OWNER", fields: ["owner", "settings"], json: ["settings"] },
  user_settings: { prefix: "USER", fields: ["favorite_views", "appearance"], json: ["favorite_views"] },
} as const satisfies Record<string, { prefix: string; fields: readonly string[]; json: readonly string[] }>;

export type Kind = keyof typeof ENTITIES;

/** Values a create fills when the command leaves them out (SPEC.md §6.1, §12). */
const DEFAULTS: Partial<Record<Kind, Row>> = {
  goal: { description: "", visibility: "organization-wide" },
  user_settings: { favorite_views: [], appearance: "light" },
};

export type Command =
  | { op: "create"; kind: Kind; id?: string; fields: Row; reason?: string }
  | { op: "update"; kind: Kind; id: string; base_version: number; fields: Row; reason?: string };

export type EventRow = {
  sequence: number;
  timestamp: string;
  actor: string;
  entity_kind: string;
  entity: string;
  field: string;
  old: unknown;
  new: unknown;
  reason: string | null;
};

export type WriteResult =
  | { ok: true; entity: Row; events: EventRow[] }
  | { ok: false; error: "stale"; current: Row }
  | { ok: false; error: "invalid"; violations: Violation[] }
  | { ok: false; error: "unknown_actor" | "not_found" | "exists" | "bad_command"; message: string };

export function isKind(kind: unknown): kind is Kind {
  return typeof kind === "string" && Object.hasOwn(ENTITIES, kind);
}

function decode(kind: Kind, raw: Row | undefined): Row | undefined {
  if (raw === undefined) return undefined;
  const row: Row = { ...raw };
  for (const field of ENTITIES[kind].json) {
    if (typeof row[field] === "string") row[field] = JSON.parse(row[field] as string);
  }
  return row;
}

function encode(kind: Kind, field: string, value: unknown): SQLInputValue {
  if (value === undefined || value === null) return null;
  if ((ENTITIES[kind].json as readonly string[]).includes(field)) return JSON.stringify(value);
  return value as SQLInputValue;
}

/** Read one entity's current row. */
export function read(db: DatabaseSync, kind: Kind, id: string): Row | undefined {
  return decode(kind, db.prepare(`SELECT * FROM ${kind} WHERE id = ?`).get(id) as Row | undefined);
}

/** Read Events with a sequence greater than `after`, in sequence order. */
export function readEvents(db: DatabaseSync, after = 0): EventRow[] {
  const rows = db.prepare("SELECT * FROM event WHERE sequence > ? ORDER BY sequence").all(after) as Row[];
  return rows.map((row) => ({
    ...row,
    old: row.old == null ? null : JSON.parse(row.old as string),
    new: row.new == null ? null : JSON.parse(row.new as string),
  })) as EventRow[];
}

function lookup(db: DatabaseSync): Lookup {
  return {
    get: (kind, id) => (isKind(kind) ? read(db, kind, id) : undefined),
    where: (kind, field, value) => {
      if (!isKind(kind) || !(ENTITIES[kind].fields as readonly string[]).includes(field)) return [];
      const rows = db.prepare(`SELECT * FROM ${kind} WHERE ${field} = ?`).all(value as SQLInputValue) as Row[];
      return rows.map((row) => decode(kind, row) as Row);
    },
  };
}

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
  if (before === undefined) {
    db.prepare(`INSERT INTO ${kind} (id, ${columns.join(", ")}) VALUES (?, ${columns.map(() => "?").join(", ")})`).run(id, ...values);
  } else {
    db.prepare(`UPDATE ${kind} SET ${columns.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`).run(...values, id);
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
