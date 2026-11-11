import { serve } from "@hono/node-server";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import type { ActorRef, ApiError, CommandsResponse, FormOptions, GitHubRefResponse, GitHubSearchResponse, GitHubStatusResponse, GoalEventsResponse, GoalPageResponse, GoalsResponse, MyGoalsResponse, PrioritiesResponse, WorkItemPageResponse, WorkResponse } from "./api.ts";
import { runCommands } from "./commands.ts";
import { drainGitHub, githubRepos, githubView, readGitHubRef, reposFromSettings, saveGitHubSettings, searchGitHub } from "./github.ts";
import { receiveGitHubWebhook } from "./github_notice.ts";
import { goalEvents, goalPage } from "./goalpage.ts";
import { eventStream } from "./live.ts";
import { myGoalsView, searchGoals } from "./mygoals.ts";
import { formOptions } from "./options.ts";
import { configuredIssuers, resolveActor, type Issuer } from "./auth.ts";
import { checkConfiguration, configuredDatabase, configuredOrgUnit, configuredSignInUrl, configuredTimeZone, configuredToday, configuredWebDist } from "./config.ts";
import { prioritiesView } from "./priorities.ts";
import { BRAND_SLOT, brandHead } from "./brand.ts";
import { signInPage } from "./signin.ts";
import { goalieOwner, read } from "./read.ts";
import { mayRankPriorities } from "./rules.ts";
import { openStore } from "./store.ts";
import { workItemPage, workQueue } from "./work.ts";
import { write } from "./write.ts";

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

const refuse = (c: Context<Env>, status: 400 | 401 | 403 | 404 | 413 | 415, error: string, reason: string) => c.json<ApiError>({ error, reason }, status);

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

/** Store github_repos from a GitHub save. A list already stored the same way is left. No list yet, matching the deployment repository, is left. */
function setGitHubRepos(db: DatabaseSync, actor: string, repos: string[]): { ok: true } | { ok: false; reason: string } {
  const current = read(db, "owner_settings", "owner");
  if (current === undefined || typeof current.version !== "number") return { ok: false, reason: "A repository is owner/repo or owner/*." };
  const settings = current.settings;
  const row = (typeof settings === "object" && settings !== null && !Array.isArray(settings) ? settings : {}) as Record<string, unknown>;
  const listed = row.github_repos;
  const hasKey = Object.hasOwn(row, "github_repos");
  const same = (list: readonly string[]) => list.length === repos.length && list.every((repo, index) => repo === repos[index]);
  if (!hasKey && same(githubRepos(db))) return { ok: true };
  if (hasKey && Array.isArray(listed) && listed.every((entry) => typeof entry === "string") && same(listed)) return { ok: true };
  const result = write(db, actor, { op: "update", kind: "owner_settings", id: "owner", base_version: current.version, fields: { settings: { ...row, github_repos: repos } } }, todayIn(db));
  if (result.ok) return { ok: true };
  if (result.error === "invalid") return { ok: false, reason: result.violations[0]?.message ?? "A repository is owner/repo or owner/*." };
  if (result.error === "stale") return { ok: false, reason: "A repository is owner/repo or owner/*." };
  return { ok: false, reason: result.message };
}

/** The host's login route, with the page to return to after sign-in. */
function signInHref(url: string): string {
  const { pathname, search } = new URL(url);
  const login = configuredSignInUrl();
  return `${login}${login.includes("?") ? "&" : "?"}rd=${encodeURIComponent(pathname + search)}`;
}

/**
 * The one Hono application. /api/* is the JSON API (ADR 0003). Every other path is the built React app (ADR 0010).
 * /health needs no actor (ADR 0005). POST /api/github/webhook is authenticated by the signature of its body.
 * Every other request needs a verified actor.
 */
export function createApp(db: DatabaseSync, issuers: Issuer[], webDist: string = configuredWebDist()): Hono<Env> {
  const app = new Hono<Env>();
  app.get("/health", (c) => c.text("ok"));
  // Before the bearer-token check. A bad signature answers 401. The actor is the configured agent, not the caller.
  app.post(
    "/api/github/webhook",
    bodyLimit({ maxSize: MAX_BODY, onError: (c) => c.json({ error: "bad_command", reason: `a request body is at most ${MAX_BODY / 1024} KB` }, 413) }),
    (c) => receiveGitHubWebhook(db, c, todayIn(db)),
  );
  app.use("*", async (c, next) => {
    const who = await resolveActor(db, c.req.header(), issuers);
    if (!who.ok) return c.req.path.startsWith("/api/") ? refuse(c, 401, "unauthenticated", who.reason) : c.html(signInPage(who.reason, signInHref(c.req.url)), 401);
    c.set("actor", { id: who.actor.id as string, name: who.actor.display_name as string });
    await next();
  });
  // Resolve the org unit once (review E22). An empty store has none yet, so try again until it does.
  let orgUnit = "";
  const unit = () => (orgUnit ||= configuredOrgUnit(db));
  app.get("/api/priorities", (c) => {
    const me = c.get("actor");
    const owner = goalieOwner(db);
    const mayRank = mayRankPriorities(me.id, owner, read(db, "org_unit", unit()));
    return c.json<PrioritiesResponse>({ ...prioritiesView(db, unit(), ...todayAndZone(db)), me, mayRank, goalieOwner: me.id === owner });
  });
  app.get("/api/github/status", (c) => {
    if (c.get("actor").id !== goalieOwner(db)) return refuse(c, 403, "forbidden", "only the GOALIE owner can see GitHub");
    return c.json<GitHubStatusResponse>(githubView(db));
  });
  app.get("/api/my-goals", (c) => {
    const me = c.get("actor");
    return c.json<MyGoalsResponse>({ ...myGoalsView(db, me.id, todayIn(db)), me });
  });
  app.get("/api/goals", (c) => {
    const q = (c.req.query("q") ?? "").replace(/\s+/g, " ").trim();
    if (!q) return refuse(c, 400, "bad_request", "q is the text to search for: not blank");
    return c.json<GoalsResponse>(searchGoals(db, q.slice(0, 100)));
  });
  app.post(
    "/api/github/status",
    async (c, next) => {
      if (!(c.req.header("Content-Type") ?? "").toLowerCase().startsWith("application/json")) return refuse(c, 415, "bad_command", "a write is sent as application/json");
      const origin = c.req.header("Origin");
      const host = c.req.header("X-Forwarded-Host") ?? c.req.header("Host");
      if (origin !== undefined && origin !== "null" && hostOf(origin) !== host) return refuse(c, 403, "forbidden", `a write from ${origin} is refused`);
      if (origin === "null") return refuse(c, 403, "forbidden", "a write from an opaque origin is refused");
      await next();
    },
    bodyLimit({ maxSize: MAX_BODY, onError: (c) => refuse(c, 413, "bad_command", `a request body is at most ${MAX_BODY / 1024} KB`) }),
    async (c) => {
      if (c.get("actor").id !== goalieOwner(db)) return refuse(c, 403, "forbidden", "only the GOALIE owner can set GitHub");
      const request: unknown = await c.req.json().catch(() => undefined);
      const repos = reposFromSettings(request);
      if (repos === "bad") return refuse(c, 400, "bad_request", "A repository is owner/repo or owner/*.");
      const saved = saveGitHubSettings(db, request);
      if (!saved.ok) return refuse(c, 400, "bad_request", saved.reason);
      if (repos !== "absent") {
        const set = setGitHubRepos(db, c.get("actor").id, repos);
        if (!set.ok) return refuse(c, 400, "bad_request", set.reason);
      }
      return c.json<GitHubStatusResponse>(githubView(db));
    },
  );
  app.get("/api/github/search", async (c) => {
    const goal = c.req.query("goal") ?? "";
    if (read(db, "goal", goal) === undefined) return refuse(c, 404, "not_found", `no goal ${goal}`);
    const found = await searchGitHub(db, goal, c.req.query("q") ?? "");
    return c.json<GitHubSearchResponse>({ items: found.items });
  });
  app.get("/api/github/ref", async (c) => {
    const goal = c.req.query("goal") ?? "";
    if (read(db, "goal", goal) === undefined) return refuse(c, 404, "not_found", `no goal ${goal}`);
    const found = await readGitHubRef(db, goal, c.req.query("url") ?? "");
    if (found.status === 404) return refuse(c, 404, "not_found", found.reason);
    return c.json<GitHubRefResponse>(found.body);
  });
  app.get("/api/goals/:id", (c) => {
    const page = goalPage(db, c.req.param("id"), c.get("actor").id, ...todayAndZone(db));
    return page ? c.json<GoalPageResponse>(page) : refuse(c, 404, "not_found", `no goal ${c.req.param("id")}`);
  });
  app.get("/api/goals/:id/events", (c) => {
    const before = Number(c.req.query("before"));
    if (!Number.isSafeInteger(before) || before < 1) return refuse(c, 400, "bad_request", "before is the sequence of an Event: a whole number");
    const page = goalEvents(db, c.req.param("id"), before);
    return page ? c.json<GoalEventsResponse>(page) : refuse(c, 404, "not_found", `no goal ${c.req.param("id")}`);
  });
  app.get("/api/options", (c) => c.json<FormOptions>(formOptions(db, c.get("actor").id, unit(), todayIn(db))));
  app.get("/api/work-items/:key", (c) => {
    const page = workItemPage(db, c.req.param("key"), c.get("actor").id, todayIn(db));
    return page ? c.json<WorkItemPageResponse>(page) : refuse(c, 404, "not_found", `no work item ${c.req.param("key")}`);
  });
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
    const actor = c.get("actor").id;
    const today = todayIn(db);
    const answer = runCommands(db, actor, request, today);
    await drainGitHub(db);
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
  void start();
}

async function start(): Promise<void> {
  try {
    checkConfiguration();
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
  }
  const db = openStore(configuredDatabase());
  await drainGitHub(db);
  listen(createApp(db, configuredIssuers()), configuredPort(), process.env.HOST);
}
