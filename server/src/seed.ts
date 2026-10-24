import type { DatabaseSync } from "node:sqlite";
import { read, readAll } from "./read.ts";
import { inTransaction, write, type Command } from "./write.ts";

/**
 * Load a seed: a data file of writes, each made as its `as` actor through the write path, in one transaction.
 * A deployment's data lives in its seed file, outside src/, so no deployment ships another's (review E7).
 * A base seed loads into an empty store. A seed with `onto` loads into a store that holds that base already,
 * and can load again: a create of an actor that exists, or of a work item with the same owner and title, updates it instead.
 */

export type SeedFile = { about?: string[]; onto?: string; writes: { as: string; command: Command }[] };

type SeedResult = { ok: true; events: number } | { ok: false; reason: string; command?: Command; result?: unknown };

/** For a seed with `onto`: the update that brings an existing row to the command's fields, else the command itself. */
function onto(db: DatabaseSync, command: Command): Command {
  if (command.op !== "create") return command;
  const existing =
    command.kind === "actor" && typeof command.id === "string"
      ? read(db, "actor", command.id)
      : command.kind === "work_item" && command.id == null
        ? readAll(db, "work_item").find((w) => w.owner === command.fields.owner && w.title === command.fields.title)
        : undefined;
  if (existing === undefined) return command;
  return { op: "update", kind: command.kind, id: existing.id as string, base_version: existing.version as number, fields: command.fields, reason: command.reason };
}

export function seed(db: DatabaseSync, file: SeedFile): SeedResult {
  if (!Array.isArray(file?.writes)) return { ok: false, reason: "the seed file has no writes list" };
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM actor").get() as { n: number };
  if (file.onto === undefined && n > 0) return { ok: false, reason: "the store is not empty" };
  if (file.onto !== undefined && n === 0) return { ok: false, reason: `this seed loads onto ${file.onto}. Load that first.` };
  return inTransaction(db, (result: SeedResult) => result.ok, () => {
    let events = 0;
    for (const { as, command } of file.writes) {
      const applied = file.onto === undefined ? command : onto(db, command);
      const result = write(db, as, applied);
      if (!result.ok) return { ok: false, reason: "a seed write was rejected", command: applied, result };
      events += result.events.length;
    }
    return { ok: true, events };
  });
}
