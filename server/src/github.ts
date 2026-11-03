import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import type { Row } from "./rules.ts";

/**
 * Push a work item's status to one linked GitHub issue (issue #72, phase 1, ADR 0012).
 * github_push is not an entity and not an Event. The row is written in the work item's transaction.
 * The call to GitHub runs after that transaction commits. A failure stays on the row and shows on the work item.
 */

const STATUS_LABELS = ["Backlog", "In Progress", "Completed", "Deleted"] as const;
const CONFIG_NAMES = ["GOALIE_GITHUB_APP_ID", "GOALIE_GITHUB_INSTALLATION_ID", "GOALIE_GITHUB_PRIVATE_KEY_FILE", "GOALIE_GITHUB_REPO", "GOALIE_PUBLIC_URL"] as const;
const ISSUE_URL = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)\/?$/;
const TRAILER = /<!-- goalie -->[\s\S]*?<!-- \/goalie -->/;

type GitHubConfig = { appId: string; installationId: string; privateKey: string; owner: string; repo: string; api: string; publicUrl: string };
type Ready = { ok: true; config: GitHubConfig } | { ok: false; error: string };
type PushRow = { work_item: string; issue: string; status: string; goal: string };

/** The failure stored for a work item, or null when nothing is waiting and nothing has failed. */
export function githubError(db: DatabaseSync, id: string): string | null {
  const row = db.prepare("SELECT error FROM github_push WHERE work_item = ?").get(id) as { error: string | null } | undefined;
  return row?.error ?? null;
}

/**
 * Record the push for a committed status change, in the same transaction as the Event.
 * No linked issue in the configured repository clears a pending push.
 * With no repository configured, the first GitHub issue link is recorded so the failure can show.
 */
export function queueGitHubPush(db: DatabaseSync, after: Row): void {
  const id = after.id;
  if (typeof id !== "string") return;
  const issue = linkedIssue(after.links, process.env.GOALIE_GITHUB_REPO?.trim());
  if (issue === undefined) {
    db.prepare("DELETE FROM github_push WHERE work_item = ?").run(id);
    return;
  }
  const status = after.status;
  const goal = after.goal;
  if (typeof status !== "string" || typeof goal !== "string") return;
  db.prepare(
    `INSERT INTO github_push (work_item, issue, status, goal, error) VALUES (?, ?, ?, ?, NULL)
     ON CONFLICT(work_item) DO UPDATE SET issue = excluded.issue, status = excluded.status, goal = excluded.goal, error = NULL`,
  ).run(id, issue, status, goal);
}

/** Send every pending push. Call this only after the work item transaction has committed. */
export async function drainGitHub(db: DatabaseSync): Promise<void> {
  const pending = db.prepare("SELECT work_item, issue, status, goal FROM github_push WHERE error IS NULL").all() as PushRow[];
  if (pending.length === 0) return;
  const ready = configuredGitHub();
  for (const row of pending) {
    let error: string | null;
    try {
      error = ready.ok ? await push(ready.config, row) : ready.error;
    } catch {
      error = "GitHub could not be reached.";
    }
    if (error === null) db.prepare("DELETE FROM github_push WHERE work_item = ?").run(row.work_item);
    else db.prepare("UPDATE github_push SET error = ? WHERE work_item = ?").run(error.slice(0, 500), row.work_item);
  }
}

function linkedIssue(links: unknown, repo: string | undefined): string | undefined {
  if (!Array.isArray(links)) return undefined;
  const want = repo?.split("/");
  const named = want !== undefined && want.length === 2 && want[0] !== "" && want[1] !== "";
  for (const link of links) {
    if (typeof link !== "string") continue;
    const match = ISSUE_URL.exec(link);
    if (match === null) continue;
    if (named && (match[1] !== want[0] || match[2] !== want[1])) continue;
    return `https://github.com/${match[1]}/${match[2]}/issues/${match[3]}`;
  }
  return undefined;
}

function configuredGitHub(): Ready {
  const missing = CONFIG_NAMES.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) return { ok: false, error: `GitHub is not configured. Missing ${missing.join(", ")}.` };
  const repo = process.env.GOALIE_GITHUB_REPO?.trim() ?? "";
  const parts = repo.split("/");
  if (parts.length !== 2 || parts[0] === "" || parts[1] === "") return { ok: false, error: "GitHub is not configured. GOALIE_GITHUB_REPO must be owner/repo." };
  let privateKey: string;
  try {
    privateKey = readFileSync(process.env.GOALIE_GITHUB_PRIVATE_KEY_FILE as string, "utf8");
  } catch {
    return { ok: false, error: "GitHub is not configured. The private key file could not be read." };
  }
  return {
    ok: true,
    config: {
      appId: process.env.GOALIE_GITHUB_APP_ID as string,
      installationId: process.env.GOALIE_GITHUB_INSTALLATION_ID as string,
      privateKey,
      owner: parts[0],
      repo: parts[1],
      api: (process.env.GOALIE_GITHUB_API?.trim() || "https://api.github.com").replace(/\/$/, ""),
      publicUrl: (process.env.GOALIE_PUBLIC_URL as string).trim().replace(/\/$/, ""),
    },
  };
}

/** Push one issue. Null when GitHub accepted it. */
async function push(config: GitHubConfig, row: PushRow): Promise<string | null> {
  const parsed = ISSUE_URL.exec(row.issue);
  if (parsed === null) return "The linked issue is not a GitHub issue URL.";
  try {
    const issued = await installationToken(config);
    if ("error" in issued) return issued.error;
    const token = issued.token;
    const path = `/repos/${parsed[1]}/${parsed[2]}/issues/${parsed[3]}`;
    const current = await call(config, token, "GET", path);
    if (current.status === 404) return `GitHub has no issue ${parsed[1]}/${parsed[2]}#${parsed[3]}.`;
    if (current.status !== 200) return refused(current.status, `GET ${path}`, current.body);
    const issue = current.body as { body?: string | null; labels?: { name?: string }[] };
    const names = (issue.labels ?? []).map((label) => label.name).filter((name): name is string => typeof name === "string");
    for (const name of names) {
      if (name !== row.status && (STATUS_LABELS as readonly string[]).includes(name)) {
        const removed = await call(config, token, "DELETE", `${path}/labels/${encodeURIComponent(name)}`);
        if (removed.status !== 200 && removed.status !== 404) return refused(removed.status, `DELETE ${path}/labels/${name}`, removed.body);
      }
    }
    if (!names.includes(row.status)) {
      const added = await ensureLabel(config, token, parsed[1], parsed[2], path, row.status);
      if (added !== null) return added;
    }
    const line = `Linked from GOALIE [${row.work_item}](${config.publicUrl}/goals/${encodeURIComponent(row.goal)}#work-item-${encodeURIComponent(row.work_item)}).`;
    const patch: Record<string, string> = { body: bodyWithTrailer(issue.body ?? "", line) };
    if (row.status === "Completed" || row.status === "Deleted") {
      patch.state = "closed";
      patch.state_reason = row.status === "Completed" ? "completed" : "not_planned";
    }
    const saved = await call(config, token, "PATCH", path, patch);
    if (saved.status !== 200) return refused(saved.status, `PATCH ${path}`, saved.body);
    return null;
  } catch {
    return "GitHub could not be reached.";
  }
}

async function ensureLabel(config: GitHubConfig, token: string, owner: string, repo: string, issuePath: string, name: string): Promise<string | null> {
  const added = await call(config, token, "POST", `${issuePath}/labels`, { labels: [name] });
  if (added.status === 200 || added.status === 201) return null;
  if (added.status !== 404 && added.status !== 422) return refused(added.status, `POST ${issuePath}/labels`, added.body);
  const created = await call(config, token, "POST", `/repos/${owner}/${repo}/labels`, { name, color: "ededed" });
  if (created.status !== 201 && created.status !== 422) return refused(created.status, `POST /repos/${owner}/${repo}/labels`, created.body);
  const again = await call(config, token, "POST", `${issuePath}/labels`, { labels: [name] });
  return again.status === 200 || again.status === 201 ? null : refused(again.status, `POST ${issuePath}/labels`, again.body);
}

function bodyWithTrailer(body: string, line: string): string {
  const block = `<!-- goalie -->\n${line}\n<!-- /goalie -->`;
  if (TRAILER.test(body)) return body.replace(TRAILER, block);
  const base = body.replace(/\s*$/, "");
  return `${base}${base ? "\n\n" : ""}${block}\n`;
}

async function installationToken(config: GitHubConfig): Promise<{ token: string } | { error: string }> {
  const now = Math.floor(Date.now() / 1000);
  const appToken = signJwt(config.appId, config.privateKey, now - 60, now + 540);
  const path = `/app/installations/${config.installationId}/access_tokens`;
  const response = await call(config, appToken, "POST", path);
  if (response.status !== 201 && response.status !== 200) return { error: refused(response.status, `POST ${path}`, response.body) };
  const issued = (response.body as { token?: unknown }).token;
  if (typeof issued !== "string" || issued === "") return { error: `GitHub answered ${response.status} for POST ${path} without a token.` };
  return { token: issued };
}

function signJwt(appId: string, privateKey: string, iat: number, exp: number): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${part({ alg: "RS256", typ: "JWT" })}.${part({ iat, exp, iss: appId })}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  return `${unsigned}.${signer.sign(privateKey).toString("base64url")}`;
}

type Reply = { status: number; body: unknown };

async function call(config: GitHubConfig, token: string, method: string, path: string, body?: unknown): Promise<Reply> {
  const response = await fetch(`${config.api}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "user-agent": "goalie",
      "x-github-api-version": "2022-11-28",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  let parsed: unknown = text;
  if (text !== "") {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = text;
    }
  }
  return { status: response.status, body: parsed };
}

function refused(status: number, path: string, body: unknown): string {
  const message = typeof body === "object" && body !== null && "message" in body ? ` ${String((body as { message: unknown }).message)}` : "";
  return `GitHub answered ${status} for ${path}.${message}`;
}
