import { serve } from "@hono/node-server";
import { Hono, type Context } from "hono";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import type { ActorRef, ApiError, CommandsResponse, PrioritiesResponse } from "./api.ts";
import { runCommands } from "./commands.ts";
import { configuredIssuers, resolveActor, type Issuer } from "./auth.ts";
import { configuredDatabase, configuredOrgUnit, configuredSignInUrl, configuredTimeZone, configuredToday, configuredWebDist } from "./config.ts";
import { prioritiesView } from "./priorities.ts";
import { BRAND_SLOT, brandHead } from "./brand.ts";
import { signInPage } from "./signin.ts";
import { openStore } from "./store.ts";

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

const refuse = (c: Context<Env>, status: 401 | 404, error: string, reason: string) => c.json<ApiError>({ error, reason }, status);

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
  app.get("/api/priorities", (c) => c.json<PrioritiesResponse>({ ...prioritiesView(db, unit(), configuredToday(db), configuredTimeZone(db)), me: c.get("actor") }));
  app.post("/api/commands", async (c) => {
    const request: unknown = await c.req.json().catch(() => undefined);
    const answer = runCommands(db, c.get("actor").id, request, configuredToday(db));
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
  listen(createApp(openStore(configuredDatabase()), configuredIssuers()), configuredPort(), process.env.HOST);
}
