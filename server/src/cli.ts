import { readFileSync } from "node:fs";
import { configuredDatabase } from "./config.ts";
import { openStore } from "./store.ts";
import { isKind, read, readEvents, write, type Command } from "./write.ts";

/**
 * A local tool against the GOALIE_DB file. It is not reachable over HTTP.
 * Commands print JSON. A rejected write exits 2.
 *   write --as <actor>   apply the JSON command on stdin through the write path
 *   read <kind> <id>     print one entity's current row
 *   events [after]       print the Events with a greater sequence
 */
function main(args: string[]): number {
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
    default:
      return usage();
  }
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function usage(): number {
  process.stderr.write("usage: cli.ts write --as <actor> | read <kind> <id> | events [after]\n");
  return 64;
}

process.exitCode = main(process.argv.slice(2));
