import type { DatabaseSync } from "node:sqlite";
import { inTransaction, write, type Command } from "./write.ts";

/**
 * Load a seed: a data file of writes, each made as its `as` actor through the write path, in one transaction.
 * A deployment's data lives in its seed file, outside src/, so no deployment ships another's (review E7).
 */

export type SeedFile = { about?: string[]; writes: { as: string; command: Command }[] };

type SeedResult = { ok: true; events: number } | { ok: false; reason: string; command?: Command; result?: unknown };

/** Load the seed into an empty store. Stop at the first rejected write and keep nothing. */
export function seed(db: DatabaseSync, file: SeedFile): SeedResult {
  if (!Array.isArray(file?.writes)) return { ok: false, reason: "the seed file has no writes list" };
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM actor").get() as { n: number };
  if (n > 0) return { ok: false, reason: "the store is not empty" };
  return inTransaction(db, (result: SeedResult) => result.ok, () => {
    let events = 0;
    for (const { as, command } of file.writes) {
      const result = write(db, as, command);
      if (!result.ok) return { ok: false, reason: "a seed write was rejected", command, result };
      events += result.events.length;
    }
    return { ok: true, events };
  });
}
