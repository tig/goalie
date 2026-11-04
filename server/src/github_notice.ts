import { createHmac, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Context } from "hono";
import { canonicalIssueUrl, drainGitHub, githubRepos, goalNamesRepo, recordGitHubResult, repoInScope } from "./github.ts";
import { publish, toApiEvent } from "./live.ts";
import { goalieOwner, read, readAll } from "./read.ts";
import { isGitHubAgent, type Row } from "./rules.ts";
import { write } from "./write.ts";

/**
 * A signed notice that an issue was closed (issue #72, phase 2, ADR 0012).
 * The signature is HMAC-SHA256 of the raw body. The work item changes through write().
 * When status already matches, nothing is written, so our own close does not echo.
 */

type Close = { repo: string; number: number; status: "Completed" | "Deleted"; login: string };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Undefined when the header matches. The comparison does not throw on a short header. */
function signatureError(secret: string, body: Buffer, header: string | undefined): string | undefined {
  if (header === undefined || header.trim() === "") return "the signature is missing";
  const given = header.startsWith("sha256=") ? header.slice("sha256=".length) : "";
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const left = Buffer.from(given);
  const right = Buffer.from(expected);
  if (given.length === 0 || left.length !== right.length || !timingSafeEqual(left, right)) return "the signature does not match";
  return undefined;
}

function statusOf(reason: unknown): Close["status"] | undefined {
  if (reason === "completed") return "Completed";
  if (reason === "not_planned" || reason === "duplicate") return "Deleted";
  return undefined;
}

/** A close this deployment might apply. Anything else, including a missing login, is ignored. */
function readClose(event: string | undefined, payload: unknown): Close | undefined {
  if (event !== "issues" || !isObject(payload) || payload.action !== "closed" || !isObject(payload.issue)) return undefined;
  const status = statusOf(payload.issue.state_reason);
  const repo = isObject(payload.repository) ? payload.repository.full_name : undefined;
  const login = isObject(payload.sender) ? payload.sender.login : undefined;
  const number = payload.issue.number;
  if (status === undefined || typeof repo !== "string" || typeof login !== "string" || login.trim() === "") return undefined;
  if (!Number.isInteger(number) || (number as number) < 1) return undefined;
  return { repo, number: number as number, status, login: login.trim() };
}

/** The owner and repository compare without case. A trailing slash is the same issue. */
function namesIssue(links: unknown, url: string): boolean {
  const wanted = canonicalIssueUrl(url)?.toLowerCase();
  if (wanted === undefined) return false;
  return Array.isArray(links) && links.some((link) => typeof link === "string" && canonicalIssueUrl(link)?.toLowerCase() === wanted);
}

/**
 * Set status through the one write path when the work item still names `url`.
 * After `beforeWrite`, and again on a stale retry, the read must still name `url` and `inScope` must still allow it.
 * True when nothing remains to write.
 * `beforeWrite` runs after the first read and before the write. The stale-relink test passes it. The route does not.
 * `inScope` is the route's scope check. The stale-relink test does not pass it.
 */
export async function setStatus(
  db: DatabaseSync,
  actor: string,
  id: string,
  status: string,
  reason: string,
  today: string,
  url: string,
  beforeWrite?: () => Promise<void>,
  inScope?: (row: Row) => boolean,
): Promise<boolean> {
  const once = (version: number) => {
    const result = write(db, actor, { op: "update", kind: "work_item", id, base_version: version, fields: { status }, reason }, today);
    if (result.ok && result.events.length > 0) publish(result.events.map(toApiEvent));
    return result;
  };
  const applies = (row: Row | undefined): row is Row =>
    row !== undefined && namesIssue(row.links, url) && row.status !== status && (inScope === undefined || inScope(row));
  const current = read(db, "work_item", id);
  if (!applies(current)) return true;
  await beforeWrite?.();
  const ready = read(db, "work_item", id);
  if (!applies(ready)) return true;
  const first = once(ready.version as number);
  if (first.ok) return true;
  if (first.error !== "stale") return false;
  const again = read(db, "work_item", id);
  if (!applies(again)) return true;
  const second = once(again.version as number);
  if (second.ok) return true;
  const after = read(db, "work_item", id);
  return !applies(after);
}

/** Answer one delivery. Call this before the bearer-token check. The route is not anonymous: the signature authenticates it. Only a verified delivery is stored. */
export async function receiveGitHubWebhook(db: DatabaseSync, c: Context, today: string): Promise<Response> {
  const secret = process.env.GOALIE_GITHUB_WEBHOOK_SECRET?.trim();
  if (!secret) return c.json({ error: "not_configured", reason: "GitHub is not configured. Missing GOALIE_GITHUB_WEBHOOK_SECRET." }, 503);
  const raw = Buffer.from(await c.req.arrayBuffer());
  const signature = signatureError(secret, raw, c.req.header("X-Hub-Signature-256"));
  if (signature !== undefined) return c.json({ error: "unauthenticated", reason: signature }, 401);
  const refused = (status: 503 | 500, error: string, reason: string) => {
    recordGitHubResult(db, "inbound", false, reason);
    return c.json({ error, reason }, status);
  };
  let payload: unknown;
  try {
    payload = JSON.parse(raw.toString("utf8")) as unknown;
  } catch {
    return c.json({ ok: true });
  }
  const close = readClose(c.req.header("X-GitHub-Event"), payload);
  if (close === undefined) return c.json({ ok: true });
  if (!repoInScope(close.repo, githubRepos(db))) return c.json({ ok: true });
  const actorId = process.env.GOALIE_GITHUB_ACTOR?.trim();
  const actor = actorId === undefined || actorId === "" ? undefined : read(db, "actor", actorId);
  if (actorId === undefined || actorId === "" || actor === undefined || !isGitHubAgent(actor, goalieOwner(db), actorId)) {
    return refused(503, "not_configured", "GitHub is not configured. GOALIE_GITHUB_ACTOR must be an agent whose operator is the GOALIE owner.");
  }
  const url = `https://github.com/${close.repo}/issues/${close.number}`;
  const reason = `Closed on GitHub by ${close.login}.`;
  const inScope = (row: Row) => goalNamesRepo(db, row.goal, close.repo) && repoInScope(close.repo, githubRepos(db));
  let wrote = true;
  let changed = false;
  for (const row of readAll(db, "work_item")) {
    const id = row.id;
    const links = row.links;
    if (typeof id !== "string" || !namesIssue(links, url)) continue;
    if (!goalNamesRepo(db, row.goal, close.repo)) continue;
    const before = row.status;
    if (!(await setStatus(db, actorId, id, close.status, reason, today, url, undefined, inScope))) wrote = false;
    else if (read(db, "work_item", id)?.status !== before) changed = true;
  }
  await drainGitHub(db);
  if (!wrote) return refused(500, "not_written", "the work item was not updated");
  recordGitHubResult(db, "inbound", true, changed ? `Closed ${close.repo}#${close.number}.` : `No linked work item changed for ${close.repo}#${close.number}.`);
  return c.json({ ok: true });
}
