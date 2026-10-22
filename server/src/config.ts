import type { DatabaseSync } from "node:sqlite";
import { rootOrgUnit } from "./read.ts";

/** GOALIE_DB is the SQLite file path (ADR 0006). The default is goalie.db in the working directory. */
export function configuredDatabase(): string {
  return process.env.GOALIE_DB || "goalie.db";
}

/** GOALIE_ORG_UNIT is the org unit whose Priorities open on Home. The default is the root org unit. */
export function configuredOrgUnit(db: DatabaseSync): string {
  return process.env.GOALIE_ORG_UNIT || rootOrgUnit(db) || "";
}
