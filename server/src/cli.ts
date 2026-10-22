import { readFileSync } from "node:fs";
import { configuredIssuers, resolveActor } from "./auth.ts";
import { configuredDatabase, configuredOrgUnit } from "./config.ts";
import { homePage } from "./home.ts";
import { prioritiesView } from "./priorities.ts";
import { openStore } from "./store.ts";
import { seed } from "./seed.ts";
import { checkStore, isKind, read, readEvents, write, type Command } from "./write.ts";

/**
 * A local tool against the GOALIE_DB file. It is not reachable over HTTP.
 * Commands print JSON. A rejected write exits 2.
 *   write --as <actor>   apply the JSON command on stdin through the write path
 *   read <kind> <id>     print one entity's current row
 *   events [after]       print the Events with a greater sequence
 *   seed                 load the Excaliwire seed into an empty store
 *   check                re-run every rule and lint; exit 2 if a rule is broken
 *   whoami               resolve the JSON request headers on stdin to one actor (ADR 0005)
 *   home [--as <actor>]  print the Home page as {"html"}, drawn for that actor (default chelsea)
 */
async function main(args: string[]): Promise<number> {
  const db = openStore(configuredDatabase());
  const [command, ...rest] = args;
  switch (command) {
    case "write": {
      if (rest[0] !== "--as" || !rest[1]) return usage();
      const result = write(db, rest[1], JSON.parse(readFileSync(0, "utf-8")) as Command);
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
      const result = seed(db);
      print(result);
      return result.ok ? 0 : 2;
    }
    case "check": {
      const report = checkStore(db);
      print(report);
      return report.violations.length === 0 ? 0 : 2;
    }
    case "whoami": {
      const headers = JSON.parse(readFileSync(0, "utf-8")) as Record<string, string>;
      const result = await resolveActor(db, headers, configuredIssuers());
      print(result);
      return result.ok ? 0 : 2;
    }
    case "home": {
      const id = rest[0] === "--as" && rest[1] ? rest[1] : "chelsea";
      const actor = read(db, "actor", id);
      if (!actor) return usage();
      print({ html: homePage(prioritiesView(db, configuredOrgUnit()), { id, name: actor.display_name as string }) });
      return 0;
    }
    default:
      return usage();
  }
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function usage(): number {
  process.stderr.write("usage: cli.ts write --as <actor> | read <kind> <id> | events [after] | seed | check | whoami | home [--as <actor>]\n");
  return 64;
}

process.exitCode = await main(process.argv.slice(2));
