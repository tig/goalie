import type { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { configuredIssuers, resolveActor } from "./auth.ts";
import { configuredDatabase, configuredTimeZone, configuredToday } from "./config.ts";
import { openStore } from "./store.ts";
import { seed, type SeedFile } from "./seed.ts";
import { isKind, read, readEvents } from "./read.ts";
import { checkStore, write, type Command } from "./write.ts";

/**
 * A local tool against the GOALIE_DB file. It is not reachable over HTTP.
 * Commands print JSON. A rejected write exits 2.
 *   write --as <actor>   apply the JSON command on stdin through the write path
 *   read <kind> <id>     print one entity's current row
 *   events [after]       print the Events with a greater sequence
 *   seed [file]          load a seed file into an empty store (default seed/excaliwire.json)
 *   check                re-run every rule and lint; exit 2 if a rule is broken
 *   whoami               resolve the JSON request headers on stdin to one actor (ADR 0005)
 */
async function main(args: string[]): Promise<number> {
  const db = openStore(configuredDatabase());
  const [command, ...rest] = args;
  switch (command) {
    case "write": {
      if (rest[0] !== "--as" || !rest[1]) return usage();
      const command = stdinJson();
      if (command === undefined) return badInput("stdin is not JSON");
      const result = write(db, rest[1], command as Command, today(db));
      print(result);
      return result.ok ? 0 : 2;
    }
    case "read": {
      const [kind, id] = rest;
      if (!isKind(kind) || !id) return usage();
      print(read(db, kind, id) ?? null);
      return 0;
    }
    case "events":
      print(readEvents(db, Number(rest[0] ?? 0)));
      return 0;
    case "seed": {
      const file = jsonFile(rest[0] ?? fileURLToPath(new URL("../seed/excaliwire.json", import.meta.url)));
      if (file === undefined) return badInput("the seed file is not JSON");
      const result = seed(db, file as SeedFile, today(db));
      print(result);
      return result.ok ? 0 : 2;
    }
    case "check": {
      const report = checkStore(db);
      print(report);
      return report.violations.length === 0 ? 0 : 2;
    }
    case "whoami": {
      const headers = stdinJson();
      if (headers === undefined) return badInput("stdin is not JSON");
      const result = await resolveActor(db, headers as Record<string, string>, configuredIssuers());
      print(result);
      return result.ok ? 0 : 2;
    }
    default:
      return usage();
  }
}

/** The JSON in a file (0 is stdin), or undefined when it cannot be read as JSON. */
function jsonFile(path: string | 0): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch {
    return undefined;
  }
}

const stdinJson = () => jsonFile(0);

/** Bad input is a named rejection, like a rejected write. */
function badInput(message: string): number {
  print({ ok: false, error: "bad_command", message });
  return 2;
}

/** The org's day, read once at the edge and passed to the write path. */
const today = (db: DatabaseSync) => configuredToday(configuredTimeZone(db));

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function usage(): number {
  process.stderr.write("usage: cli.ts write --as <actor> | read <kind> <id> | events [after] | seed [file] | check | whoami\n");
  return 64;
}

process.exitCode = await main(process.argv.slice(2));
