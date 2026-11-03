import { createHmac, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Context } from "hono";
import { canonicalIssueUrl, drainGitHub } from "./github.ts";
import { goalieOwner, read, readAll } from "./read.ts";
import { isGitHubAgent } from "./rules.ts";
import { write } from "./write.ts";

/**
 * A signed notice that an issue was closed (issue #72, phase 2, ADR 0012).
 * The signature is HMAC-SHA256 of the raw body. The work item changes through write().
 * When status already matches, nothing is written, so our own close does not echo.
 */

type Close = { repo: string; number: number; status: "Completed" | "Deleted"; login: string };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function configuredRepo(): string | undefined {
  const repo = process.env.GOALIE_GITHUB_REPO?.trim() ?? "";
  const parts = repo.split("/");
  if (parts.length !== 2 || parts[0] === "" || parts[1] === "") return undefined;
  return repo;
}

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

/** Set status through the one write path. A stale write is tried once more. True when the row ends on that status. */
function setStatus(db: DatabaseSync, actor: string, id: string, status: string, reason: string, today: string): boolean {
  const once = (version: number) => write(db, actor, { op: "update", kind: "work_item", id, base_version: version, fields: { status }, reason }, today);
  const current = read(db, "work_item", id);
  if (current === undefined || current.status === status) return true;
  const first = once(current.version as number);
  if (first.ok) return true;
  if (first.error !== "stale") return false;
  const again = read(db, "work_item", id);
  if (again === undefined || again.status === status) return true;
  const second = once(again.version as number);
  if (second.ok) return true;
  const after = read(db, "work_item", id);
  return after === undefined || after.status === status;
}

/** Answer one delivery. Call this before the bearer-token check. The route is not anonymous: the signature authenticates it. */
export async function receiveGitHubWebhook(db: DatabaseSync, c: Context, today: string): Promise<Response> {
  const secret = process.env.GOALIE_GITHUB_WEBHOOK_SECRET?.trim();
  if (!secret) return c.json({ error: "not_configured", reason: "GitHub is not configured. Missing GOALIE_GITHUB_WEBHOOK_SECRET." }, 503);
  const raw = Buffer.from(await c.req.arrayBuffer());
  const signature = signatureError(secret, raw, c.req.header("X-Hub-Signature-256"));
  if (signature !== undefined) return c.json({ error: "unauthenticated", reason: signature }, 401);
  let payload: unknown;
  try {
    payload = JSON.parse(raw.toString("utf8")) as unknown;
  } catch {
    return c.json({ ok: true });
  }
  const close = readClose(c.req.header("X-GitHub-Event"), payload);
  if (close === undefined) return c.json({ ok: true });
  const repo = configuredRepo();
  if (repo === undefined) return c.json({ error: "not_configured", reason: "GitHub is not configured. GOALIE_GITHUB_REPO must be owner/repo." }, 503);
  if (close.repo !== repo) return c.json({ ok: true });
  const actorId = process.env.GOALIE_GITHUB_ACTOR?.trim();
  const actor = actorId === undefined || actorId === "" ? undefined : read(db, "actor", actorId);
  if (actorId === undefined || actorId === "" || actor === undefined || !isGitHubAgent(actor, goalieOwner(db), actorId)) {
    return c.json({ error: "not_configured", reason: "GitHub is not configured. GOALIE_GITHUB_ACTOR must be an agent whose operator is the GOALIE owner." }, 503);
  }
  const url = `https://github.com/${close.repo}/issues/${close.number}`;
  const reason = `Closed on GitHub by ${close.login}.`;
  let wrote = true;
  for (const row of readAll(db, "work_item")) {
    const id = row.id;
    const links = row.links;
    if (typeof id !== "string" || !Array.isArray(links)) continue;
    if (!links.some((link) => typeof link === "string" && canonicalIssueUrl(link) === url)) continue;
    if (!setStatus(db, actorId, id, close.status, reason, today)) wrote = false;
  }
  await drainGitHub(db);
  return wrote ? c.json({ ok: true }) : c.json({ error: "not_written", reason: "the work item was not updated" }, 500);
}
