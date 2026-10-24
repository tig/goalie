import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { ApiActor } from "./api.ts";
import type { Lookup, Row } from "./rules.ts";

/**
 * The read model. Every read of the store goes through here. Only write.ts writes.
 * A row comes back decoded: `json` fields parsed, `bool` fields as booleans.
 */

/** The writable fields of each entity (SPEC.md §6). `json` fields hold structured values. `bool` fields are INTEGER 0/1. */
export const ENTITIES = {
  actor: { prefix: "ACTOR", fields: ["kind", "display_name", "operator", "email", "subject", "app_id"], json: [], bool: [] },
  org_unit: { prefix: "OU", fields: ["name", "level", "parent", "owner"], json: [], bool: [] },
  priority: { prefix: "PRI", fields: ["org_unit", "period", "rank", "title", "description", "cut_line", "status"], json: [], bool: ["cut_line"] },
  doc: { prefix: "DOC", fields: ["kind", "title", "body"], json: [], bool: [] },
  goal: {
    prefix: "GOAL",
    fields: [
      "summary", "description", "owner", "org_unit", "level", "type", "due_date", "date_type",
      "promotion_milestone", "plan", "committed_plan_version", "plan_maturity", "work_product",
      "original_committed_date", "changed_due_date", "severity", "priority", "state", "health",
      "path_to_green", "origination", "parent", "visibility",
    ],
    json: ["work_product", "path_to_green"],
    bool: [],
  },
  work_item: { prefix: "WI", fields: ["goal", "title", "owner", "status", "due_date", "links"], json: ["links"], bool: [] },
  draft: { prefix: "DRAFT", fields: ["entity", "actor", "base_version", "change", "reason"], json: ["change"], bool: [] },
  owner_settings: { prefix: "OWNER", fields: ["owner", "settings"], json: ["settings"], bool: [] },
  user_settings: { prefix: "USER", fields: ["favorite_views", "appearance"], json: ["favorite_views"], bool: [] },
} as const satisfies Record<string, { prefix: string; fields: readonly string[]; json: readonly string[]; bool: readonly string[] }>;

export type Kind = keyof typeof ENTITIES;

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

export function isKind(kind: unknown): kind is Kind {
  return typeof kind === "string" && Object.hasOwn(ENTITIES, kind);
}

function isField(kind: Kind, field: string): boolean {
  return (ENTITIES[kind].fields as readonly string[]).includes(field);
}

/** Turn a stored row into its read shape. */
export function decode(kind: Kind, raw: Row | undefined): Row | undefined {
  if (raw === undefined) return undefined;
  const row: Row = { ...raw };
  for (const field of ENTITIES[kind].json) {
    if (typeof row[field] === "string") row[field] = JSON.parse(row[field] as string);
  }
  for (const field of ENTITIES[kind].bool) {
    if (row[field] != null) row[field] = row[field] === 1;
  }
  return row;
}

/** Turn one field's read value into its stored value. */
export function encode(kind: Kind, field: string, value: unknown): SQLInputValue {
  if (value === undefined || value === null) return null;
  if ((ENTITIES[kind].json as readonly string[]).includes(field)) return JSON.stringify(value);
  if ((ENTITIES[kind].bool as readonly string[]).includes(field) && typeof value === "boolean") return value ? 1 : 0;
  return value as SQLInputValue;
}

/** Read one entity's current row. */
export function read(db: DatabaseSync, kind: Kind, id: string): Row | undefined {
  return decode(kind, db.prepare(`SELECT * FROM ${kind} WHERE id = ?`).get(id) as Row | undefined);
}

/** Read every current row of one kind, in id order, with one query. */
export function readAll(db: DatabaseSync, kind: Kind): Row[] {
  return (db.prepare(`SELECT * FROM ${kind} ORDER BY id`).all() as Row[]).map((row) => decode(kind, row) as Row);
}

/** Read Events with a sequence greater than `after`, in sequence order. */
/** The one Event decoder: old and new are stored as JSON. */
function decodeEvent(row: Row): EventRow {
  return { ...row, old: row.old == null ? null : JSON.parse(row.old as string), new: row.new == null ? null : JSON.parse(row.new as string) } as EventRow;
}

export function readEvents(db: DatabaseSync, after = 0): EventRow[] {
  return (db.prepare("SELECT * FROM event WHERE sequence > ? ORDER BY sequence").all(after) as Row[]).map(decodeEvent);
}

/** The Events of the named entities, newest first, through the event_by_entity index. */
export function readEntityEvents(db: DatabaseSync, refs: { kind: Kind; ids: string[] }[]): EventRow[] {
  const rows = refs.flatMap(({ kind, ids }) =>
    ids.length === 0 ? [] : (db.prepare("SELECT * FROM event WHERE entity_kind = ? AND entity IN (SELECT value FROM json_each(?))").all(kind, JSON.stringify(ids)) as Row[]),
  );
  return rows.sort((a, b) => (b.sequence as number) - (a.sequence as number)).map(decodeEvent);
}

/** Read the actor a verified token names. A human maps by subject, an agent by application id (ADR 0005). */
export function readActorByToken(db: DatabaseSync, kind: "human" | "agent", id: string): Row | undefined {
  const column = kind === "agent" ? "app_id" : "subject";
  return decode("actor", db.prepare(`SELECT * FROM actor WHERE ${column} = ? AND kind = ?`).get(id, kind) as Row | undefined);
}

/** The root org unit: the first by id with no parent. */
export function rootOrgUnit(db: DatabaseSync): string | undefined {
  return (db.prepare("SELECT id FROM org_unit WHERE parent IS NULL ORDER BY id LIMIT 1").get() as Row | undefined)?.id as string | undefined;
}

/** The GOALIE owner, named in owner settings (ADR 0011). */
export function goalieOwner(db: DatabaseSync): string | undefined {
  return read(db, "owner_settings", "owner")?.owner as string | undefined;
}

/** The store as the rules see it. */
export function lookup(db: DatabaseSync): Lookup {
  return {
    get: (kind, id) => (isKind(kind) ? read(db, kind, id) : undefined),
    where: (kind, field, value) => {
      if (!isKind(kind) || !isField(kind, field)) return [];
      const rows = db.prepare(`SELECT * FROM ${kind} WHERE ${field} = ?`).all(value as SQLInputValue) as Row[];
      return rows.map((row) => decode(kind, row) as Row);
    },
  };
}

/** A Lookup over rows already in memory. One query per kind, however many rules read it. */
export function memoryLookup(rows: Partial<Record<Kind, Row[]>>): Lookup {
  const byId = new Map<string, Map<string, Row>>();
  for (const [kind, list] of Object.entries(rows)) byId.set(kind, new Map((list ?? []).map((r) => [r.id as string, r])));
  return {
    get: (kind, id) => byId.get(kind)?.get(id),
    where: (kind, field, value) => [...(byId.get(kind)?.values() ?? [])].filter((r) => r[field] === value),
  };
}

/** Every actor, by id, with its kind (SPEC.md §6.4). */
export function actorsById(db: DatabaseSync): Record<string, ApiActor> {
  return Object.fromEntries(readAll(db, "actor").map((a) => [a.id, { id: a.id as string, name: a.display_name as string, kind: a.kind as ApiActor["kind"] }]));
}

/** True when the owner setting work_items is on (D7). */
export function workItemsOn(db: DatabaseSync): boolean {
  return (read(db, "owner_settings", "owner")?.settings as Row | undefined)?.work_items === true;
}
