import type { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { dateIn, isDate } from "./dates.ts";
import { read, rootOrgUnit } from "./read.ts";

/** GOALIE_DB is the SQLite file path (ADR 0006). The default is goalie.db in the working directory. */
export function configuredDatabase(): string {
  return process.env.GOALIE_DB || "goalie.db";
}

/** GOALIE_ORG_UNIT is the org unit whose Priorities open on Home. The default is the root org unit. */
export function configuredOrgUnit(db: DatabaseSync): string {
  return process.env.GOALIE_ORG_UNIT || rootOrgUnit(db) || "";
}

/** GOALIE_WEB_DIST is the folder of the built React app (ADR 0006, ADR 0010). The default is server/web/dist. */
export function configuredWebDist(): string {
  return process.env.GOALIE_WEB_DIST || fileURLToPath(new URL("../web/dist", import.meta.url));
}

/** A time zone Intl knows, else undefined. */
function knownZone(zone: unknown): string | undefined {
  if (typeof zone !== "string" || zone === "") return undefined;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return zone;
  } catch {
    return undefined;
  }
}

/** The org's time zone: the owner setting `time_zone`, else the process's local time zone (SPEC.md §12). */
export function configuredTimeZone(db: DatabaseSync): string {
  const settings = read(db, "owner_settings", "owner")?.settings as Record<string, unknown> | undefined;
  return knownZone(settings?.time_zone) ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** GOALIE_TODAY (YYYY-MM-DD) pins today, for tests. The process checks it once at start (checkConfiguration). */
function pinnedToday(): string | undefined {
  const pinned = process.env.GOALIE_TODAY;
  if (pinned && !isDate(pinned)) throw new Error(`GOALIE_TODAY must be a date written YYYY-MM-DD, not ${pinned}`);
  return pinned || undefined;
}

/** Today in the org's time zone, from configuredTimeZone(db). A request reads the zone once and passes it here. */
export function configuredToday(timeZone: string): string {
  return pinnedToday() ?? dateIn(Date.now(), timeZone);
}

/** Fail fast at start on configuration a request would trip over. */
export function checkConfiguration(): void {
  pinnedToday();
}

/** GOALIE_SIGN_IN_URL is the host's login route. The default is oauth2-proxy's /oauth2/start. */
export function configuredSignInUrl(): string {
  return process.env.GOALIE_SIGN_IN_URL || "/oauth2/start";
}
