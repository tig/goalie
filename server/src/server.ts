import { serve } from "@hono/node-server";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import type { ActorRef, ApiError, CommandsResponse, FormOptions, GoalPageResponse, PrioritiesResponse, WorkResponse } from "./api.ts";
import { runCommands } from "./commands.ts";
import { goalPage } from "./goalpage.ts";
import { eventStream } from "./live.ts";
import { formOptions } from "./options.ts";
import { configuredIssuers, resolveActor, type Issuer } from "./auth.ts";
import { checkConfiguration, configuredDatabase, configuredOrgUnit, configuredSignInUrl, configuredTimeZone, configuredToday, configuredWebDist } from "./config.ts";
import { prioritiesView } from "./priorities.ts";
import { BRAND_SLOT, brandHead } from "./brand.ts";
import { signInPage } from "./signin.ts";
import { read } from "./read.ts";
import { openStore } from "./store.ts";
import { workQueue } from "./work.ts";

/** The media types of the files a Vite build writes. */
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

/** The verified actor rides on each request after sign-in. */
type Env = { Variables: { actor: ActorRef } };

/** The largest write body: a batch of goals, sub-goals, and work items fits many times over. */
const MAX_BODY = 256 * 1024;

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
};

const refuse = (c: Context<Env>, status: 401 | 403 | 404 | 413 | 415, error: string, reason: string) => c.json<ApiError>({ error, reason }, status);

/** The file under dist that path names, or undefined when there is none or the path leaves dist. */
async function built(dist: string, path: string): Promise<Buffer | undefined> {
  const root = resolve(dist);
  let file: string;
  try {
    file = resolve(root, `.${decodeURIComponent(path)}`);
  } catch {
    return undefined;
  }
  if (!file.startsWith(root + sep)) return undefined;
  return readFile(file).catch(() => undefined);
}

/** Today and the org's time zone, with one owner-settings read (Codebase QA). */
function todayAndZone(db: DatabaseSync): [string, string] {
  const zone = configuredTimeZone(db);
  return [configuredToday(zone), zone];
}

const todayIn = (db: DatabaseSync) => todayAndZone(db)[0];

/** The host's login route, with the page to return to after sign-in. */
function signInHref(url: string): string {
  const { pathname, search } = new URL(url);
  const login = configuredSignInUrl();
  return `${login}${login.includes("?") ? "&" : "?"}rd=${encodeURIComponent(pathname + search)}`;
}

/**
 * The one Hono application. /api/* is the JSON API (ADR 0003). Every other path is the built React app (ADR 0010).
 * No request is anonymous except /health (ADR 0005).
 */
export function createApp(db: DatabaseSync, issuers: Issuer[], webDist: string = configuredWebDist()): Hono<Env> {
  const app = new Hono<Env>();
  app.get("/health", (c) => c.text("ok"));
  app.use("*", async (c, next) => {
    const who = await resolveActor(db, c.req.header(), issuers);
    if (!who.ok) return c.req.path.startsWith("/api/") ? refuse(c, 401, "unauthenticated", who.reason) : c.html(signInPage(who.reason, signInHref(c.req.url)), 401);
    c.set("actor", { id: who.actor.id as string, name: who.actor.display_name as string });
    await next();
  });
  // Resolve the org unit once (review E22). An empty store has none yet, so try again until it does.
  let orgUnit = "";
  const unit = () => (orgUnit ||= configuredOrgUnit(db));
  app.get("/api/priorities", (c) => c.json<PrioritiesResponse>({ ...prioritiesView(db, unit(), ...todayAndZone(db)), me: c.get("actor") }));
  app.get("/api/goals/:id", (c) => {
    const page = goalPage(db, c.req.param("id"), c.get("actor").id, ...todayAndZone(db));
    return page ? c.json<GoalPageResponse>(page) : refuse(c, 404, "not_found", `no goal ${c.req.param("id")}`);
  });
  app.get("/api/options", (c) => c.json<FormOptions>(formOptions(db, c.get("actor").id, unit(), todayIn(db))));
  app.get("/api/work", (c) => {
    const owner = c.req.query("owner");
    // Codebase QA Q17: a wrong link must not read as an empty queue.
    if (owner !== undefined && read(db, "actor", owner) === undefined) return refuse(c, 404, "not_found", `no actor ${owner}`);
    return c.json<WorkResponse>(workQueue(db, c.get("actor").id, todayIn(db), owner));
  });
  app.get("/api/events", (c) => eventStream(c, db));
  // A write is JSON from the app's own origin. A cross-site form can send neither (Codebase QA). The body is capped.
  app.post(
    "/api/commands",
    async (c, next) => {
      if (!(c.req.header("Content-Type") ?? "").toLowerCase().startsWith("application/json")) return refuse(c, 415, "bad_command", "a write is sent as application/json");
      const origin = c.req.header("Origin");
      const host = c.req.header("X-Forwarded-Host") ?? c.req.header("Host");
      if (origin !== undefined && origin !== "null" && hostOf(origin) !== host) return refuse(c, 403, "forbidden", `a write from ${origin} is refused`);
      if (origin === "null") return refuse(c, 403, "forbidden", "a write from an opaque origin is refused");
      await next();
    },
    bodyLimit({ maxSize: MAX_BODY, onError: (c) => refuse(c, 413, "bad_command", `a request body is at most ${MAX_BODY / 1024} KB`) }),
  );
  app.post("/api/commands", async (c) => {
    const request: unknown = await c.req.json().catch(() => undefined);
    const answer = runCommands(db, c.get("actor").id, request, todayIn(db));
    return c.json<CommandsResponse>(answer.body, answer.status);
  });
  app.all("/api/*", (c) => refuse(c, 404, "not_found", `no API route ${c.req.method} ${c.req.path}`));
  app.get("/assets/*", async (c) => {
    const body = await built(webDist, c.req.path);
    return body ? c.body(new Uint8Array(body), 200, { "Content-Type": TYPES[extname(c.req.path)] ?? "application/octet-stream" }) : c.text("Not Found", 404);
  });
  app.get("*", async (c) => {
    // A path that names a file is not a page. A missing script must not get index.html.
    if (extname(c.req.path) !== "") return c.text("Not Found", 404);
    const index = await built(webDist, "/index.html");
    return index ? c.html(index.toString("utf-8").replace(BRAND_SLOT, brandHead())) : c.text("The web app is not built. Run npm run build --prefix server.", 503);
  });
  return app;
}
/** Listen with the Node adapter. Callers choose the port. */
export function listen(
  app: Hono<Env>,
  port: number,
  hostname: string | undefined = "127.0.0.1",
): ReturnType<typeof serve> {
  return serve({ fetch: app.fetch, hostname, port });
}

function configuredPort(): number {
  const raw = process.env.PORT ?? "3000";
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer from 1 to 65535");
  }
  return port;
}

function startedAsMain(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (startedAsMain()) {
  try {
    checkConfiguration();
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
  }
  listen(createApp(openStore(configuredDatabase()), configuredIssuers()), configuredPort(), process.env.HOST);
}
