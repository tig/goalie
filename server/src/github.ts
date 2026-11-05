import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import type { GitHubStatusResponse } from "./api.ts";
import { read } from "./read.ts";
import type { Row } from "./rules.ts";

/**
 * Push a work item's status to one linked GitHub issue (issue #72, ADR 0012).
 * The repository must be in the owner setting github_repos and on the work item's goal.
 * github_push is not an entity and not an Event. The row is written in the work item's transaction.
 * The call to GitHub runs after that transaction commits. A failure stays on the row and shows on the work item.
 * Add as Github Issue creates the issue after the work item commits, then the link write records the issue URL. A failed create sets error on this row so a later drain does not send it as a status push.
 * github_result is not an entity and not an Event. It keeps the last update and the last signed notice.
 */

const STATUS_LABELS = ["Backlog", "In Progress", "Completed", "Deleted"] as const;
const CONFIG_NAMES = ["GOALIE_GITHUB_APP_ID", "GOALIE_GITHUB_INSTALLATION_ID", "GOALIE_GITHUB_PRIVATE_KEY_FILE", "GOALIE_PUBLIC_URL"] as const;
const ISSUE_URL = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)\/?$/;
const SCOPE_ENTRY = /^([^/\s]+)\/([^/\s]+)$/;
const GOAL_REPO = /^(?:https:\/\/github\.com\/|github\.com\/)([^/]+)\/([^/]+)\/?$/;
const TRAILER = /<!-- goalie -->[\s\S]*?<!-- \/goalie -->/;

type GitHubConfig = { appId: string; privateKey: string; api: string; publicUrl: string };
type Ready = { ok: true; config: GitHubConfig } | { ok: false; error: string };
type PushRow = { work_item: string; issue: string; status: string; goal: string };

/** The failure stored for a work item, or null when nothing is waiting and nothing has failed. */
export function githubError(db: DatabaseSync, id: string): string | null {
  const row = db.prepare("SELECT error FROM github_push WHERE work_item = ?").get(id) as { error: string | null } | undefined;
  return row?.error ?? null;
}

/** A failed issue create shows on the work item. error is set, so drain does not send the row as a status push. */
export function rememberGitHubFailure(db: DatabaseSync, id: string, detail: string): void {
  const item = read(db, "work_item", id);
  if (item === undefined) return;
  const goal = item.goal;
  const status = item.status;
  if (typeof goal !== "string" || typeof status !== "string") return;
  const text = detail.slice(0, 500);
  db.prepare(
    `INSERT INTO github_push (work_item, issue, status, goal, error) VALUES (?, '', ?, ?, ?)
     ON CONFLICT(work_item) DO UPDATE SET error = excluded.error`,
  ).run(id, status, goal, text);
  recordGitHubResult(db, "outbound", false, text);
}

/** The issue was opened. Drop a failure row. Leave a pending status push for drain. */
export function finishGitHubCreate(db: DatabaseSync, id: string, detail: string): void {
  db.prepare("DELETE FROM github_push WHERE work_item = ? AND (error IS NOT NULL OR issue = '')").run(id);
  recordGitHubResult(db, "outbound", true, detail);
}

/**
 * Record the push for a committed status change, in the same transaction as the Event.
 * The linked issue's repository must be in github_repos and on the work item's goal.
 * Anything else clears a pending push.
 */
export function queueGitHubPush(db: DatabaseSync, after: Row): void {
  const id = after.id;
  if (typeof id !== "string") return;
  const goalRow = typeof after.goal === "string" ? read(db, "goal", after.goal) : undefined;
  const issue = linkedIssue(after.links, githubRepos(db), goalRepos(goalRow?.work_product));
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

/** Send every pending push. Call this only after the work item transaction has committed. A row whose repository is not in github_repos and on the work item's current goal is deleted and not sent. */
export async function drainGitHub(db: DatabaseSync): Promise<void> {
  const pending = db.prepare("SELECT work_item, issue, status, goal FROM github_push WHERE error IS NULL").all() as PushRow[];
  if (pending.length === 0) return;
  const ready = configuredGitHub();
  for (const row of pending) {
    if (!pushInScope(db, row)) {
      db.prepare("DELETE FROM github_push WHERE work_item = ?").run(row.work_item);
      continue;
    }
    let error: string | null;
    try {
      error = ready.ok ? await push(ready.config, row) : ready.error;
    } catch {
      error = "GitHub could not be reached.";
    }
    const detail = error === null ? updatedDetail(row) : error.slice(0, 500);
    recordGitHubResult(db, "outbound", error === null, detail);
    if (error === null) db.prepare("DELETE FROM github_push WHERE work_item = ?").run(row.work_item);
    else db.prepare("UPDATE github_push SET error = ? WHERE work_item = ?").run(detail, row.work_item);
  }
}

/** The issue's repository is in github_repos and on the work item's current goal. */
function pushInScope(db: DatabaseSync, row: PushRow): boolean {
  const match = ISSUE_URL.exec(row.issue);
  if (match === null) return false;
  const repo = `${match[1]}/${match[2]}`;
  return repoInScope(repo, githubRepos(db)) && goalNamesRepo(db, read(db, "work_item", row.work_item)?.goal, repo);
}

/** The last update and the last signed notice. The private key stays out of this. The list is github_repos. */
export function githubView(db: DatabaseSync): GitHubStatusResponse {
  return {
    configured: configuredGitHub().ok,
    repositories: githubRepos(db),
    outbound: storedResult(db, "outbound"),
    inbound: storedResult(db, "inbound"),
  };
}

/** Keep the last result of one kind. The last push in a drain is the one that remains. */
export function recordGitHubResult(db: DatabaseSync, kind: "outbound" | "inbound", ok: boolean, detail: string): void {
  db.prepare(
    `INSERT INTO github_result (kind, ok, detail) VALUES (?, ?, ?)
     ON CONFLICT(kind) DO UPDATE SET ok = excluded.ok, detail = excluded.detail`,
  ).run(kind, ok ? 1 : 0, detail);
}

function updatedDetail(row: PushRow): string {
  const match = ISSUE_URL.exec(row.issue);
  const name = match === null ? row.issue : `${match[1]}/${match[2]}#${match[3]}`;
  return `Updated ${name} to ${row.status}.`;
}

/** `owner/repo` and `owner/*` from owner settings. Any other entry is dropped. No list yet uses the deployment repository. An empty list stays empty. */
export function githubRepos(db: DatabaseSync): string[] {
  const settings = read(db, "owner_settings", "owner")?.settings;
  if (typeof settings !== "object" || settings === null || Array.isArray(settings)) return [];
  const row = settings as Row;
  if (!Object.hasOwn(row, "github_repos")) return deploymentRepo();
  const list = row.github_repos;
  if (!Array.isArray(list)) return [];
  const kept: string[] = [];
  for (const entry of list) {
    if (typeof entry !== "string") continue;
    const match = SCOPE_ENTRY.exec(entry);
    if (match === null) continue;
    kept.push(`${match[1]}/${match[2]}`);
  }
  return kept;
}

/** The one repository in process configuration, or none when that name is missing or not `owner/repo` or `owner/*`. */
function deploymentRepo(): string[] {
  const match = SCOPE_ENTRY.exec(process.env.GOALIE_GITHUB_REPO?.trim() ?? "");
  return match === null ? [] : [`${match[1]}/${match[2]}`];
}

/** True when `owner/*` covers repo, or the entry is that `owner/repo`. GitHub compares the names without case. */
export function repoInScope(repo: string, scopes: readonly string[]): boolean {
  const slash = repo.indexOf("/");
  if (slash <= 0 || slash !== repo.lastIndexOf("/")) return false;
  const owner = repo.slice(0, slash).toLowerCase();
  const name = repo.slice(slash + 1).toLowerCase();
  return scopes.some((entry) => {
    const cut = entry.indexOf("/");
    const entryName = entry.slice(cut + 1).toLowerCase();
    return entry.slice(0, cut).toLowerCase() === owner && (entryName === "*" || entryName === name);
  });
}

/** True when the goal's work_product names repo as a `repo` entry. The names compare without case. */
export function goalNamesRepo(db: DatabaseSync, goalId: unknown, repo: string): boolean {
  if (typeof goalId !== "string") return false;
  return goalRepos(read(db, "goal", goalId)?.work_product).has(repo.toLowerCase());
}

/** True when repo is a repository, in github_repos, and on the goal. A wildcard is not a repository. */
export function issueRepoAllowed(db: DatabaseSync, goalId: unknown, repo: string): boolean {
  if (!SCOPE_ENTRY.test(repo) || repo.endsWith("/*")) return false;
  return repoInScope(repo, githubRepos(db)) && goalNamesRepo(db, goalId, repo);
}

/** Repositories this goal names that github_repos covers. Order follows github_repos. A wildcard offers that owner's repositories on the goal, in work_product order, and is not a choice. */
export function reposOnGoal(db: DatabaseSync, goalId: string): string[] {
  const named = reposNamedOnGoal(read(db, "goal", goalId)?.work_product);
  const result: string[] = [];
  const seen = new Set<string>();
  for (const entry of githubRepos(db)) {
    const slash = entry.lastIndexOf("/");
    const owner = entry.slice(0, slash).toLowerCase();
    const name = entry.slice(slash + 1);
    if (name === "*") {
      for (const repo of named) {
        if (repo.slice(0, repo.indexOf("/")).toLowerCase() !== owner) continue;
        pushRepo(result, seen, repo);
      }
      continue;
    }
    if (named.some((repo) => repo.toLowerCase() === entry.toLowerCase())) pushRepo(result, seen, entry);
  }
  return result;
}

function pushRepo(result: string[], seen: Set<string>, repo: string): void {
  const key = repo.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  result.push(repo);
}

function storedResult(db: DatabaseSync, kind: "outbound" | "inbound"): { ok: boolean; detail: string } | null {
  const row = db.prepare("SELECT ok, detail FROM github_result WHERE kind = ?").get(kind) as { ok: number; detail: string } | undefined;
  if (row === undefined) return null;
  return { ok: row.ok === 1, detail: row.detail };
}

/** The issue URL in canonical form, or undefined when link is not a GitHub issue URL. A trailing slash is the same issue. */
export function canonicalIssueUrl(link: string): string | undefined {
  const match = ISSUE_URL.exec(link);
  if (match === null) return undefined;
  return `https://github.com/${match[1]}/${match[2]}/issues/${match[3]}`;
}

/** The first linked issue whose repository is in scope and on the goal. */
function linkedIssue(links: unknown, scopes: readonly string[], onGoal: ReadonlySet<string>): string | undefined {
  if (!Array.isArray(links)) return undefined;
  for (const link of links) {
    if (typeof link !== "string") continue;
    const url = canonicalIssueUrl(link);
    if (url === undefined) continue;
    const match = ISSUE_URL.exec(url);
    if (match === null) continue;
    const repo = `${match[1]}/${match[2]}`;
    if (!onGoal.has(repo.toLowerCase()) || !repoInScope(repo, scopes)) continue;
    return url;
  }
  return undefined;
}

/** `repo` values written `github.com/owner/repo` or `https://github.com/owner/repo`, in work_product order, with the casing written on the goal. */
function reposNamedOnGoal(workProduct: unknown): string[] {
  const found: string[] = [];
  if (!Array.isArray(workProduct)) return found;
  for (const entry of workProduct) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
    const value = (entry as Row).repo;
    if (typeof value !== "string") continue;
    const match = GOAL_REPO.exec(value);
    if (match === null) continue;
    found.push(`${match[1]}/${match[2]}`);
  }
  return found;
}

/** The names compare without case. Other entries are not repositories. */
function goalRepos(workProduct: unknown): Set<string> {
  return new Set(reposNamedOnGoal(workProduct).map((repo) => repo.toLowerCase()));
}

function configuredGitHub(): Ready {
  const missing = CONFIG_NAMES.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) return { ok: false, error: `GitHub is not configured. Missing ${missing.join(", ")}.` };
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
      privateKey,
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
    const issued = await installationToken(config, parsed[1], parsed[2]);
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
    const line = trailerLine(config.publicUrl, row.goal, row.work_item);
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

function trailerLine(publicUrl: string, goal: string, workItem: string): string {
  return `Linked from GOALIE [${workItem}](${publicUrl}/goals/${encodeURIComponent(goal)}#work-item-${encodeURIComponent(workItem)}).`;
}

/** The link Event's reason. It names the issue. */
export function openedIssueReason(url: string): string {
  const match = ISSUE_URL.exec(url);
  const name = match === null ? url : `${match[1]}/${match[2]}#${match[3]}`;
  return `Opened ${name}.`;
}

export type OpenedIssue = { url: string; labelError: string | null } | { error: string };

/** Open one issue. The caller writes the URL onto the work item after this returns. A failure has no URL. */
export async function createGitHubIssue(db: DatabaseSync, workItemId: string, repo: string): Promise<OpenedIssue> {
  const item = read(db, "work_item", workItemId);
  if (item === undefined) return { error: `no work item ${workItemId}` };
  if (!issueRepoAllowed(db, item.goal, repo)) return { error: `${repo} is not in scope on this goal.` };
  const ready = configuredGitHub();
  if (!ready.ok) return { error: ready.error };
  const match = SCOPE_ENTRY.exec(repo);
  if (match === null) return { error: `${repo} is not in scope on this goal.` };
  const title = item.title;
  const status = item.status;
  const goal = item.goal;
  if (typeof title !== "string" || typeof status !== "string" || typeof goal !== "string") return { error: `${repo} is not in scope on this goal.` };
  try {
    const issued = await installationToken(ready.config, match[1], match[2]);
    if ("error" in issued) return { error: issued.error };
    const path = `/repos/${match[1]}/${match[2]}/issues`;
    const created = await call(ready.config, issued.token, "POST", path, { title, body: bodyWithTrailer("", trailerLine(ready.config.publicUrl, goal, workItemId)) });
    if (created.status !== 201) return { error: refused(created.status, `POST ${path}`, created.body) };
    const url = createdIssueUrl(created.body);
    const parsed = url === undefined ? null : ISSUE_URL.exec(url);
    if (url === undefined || parsed === null) return { error: `GitHub answered 201 for POST ${path} without an issue URL.` };
    const labelError = await ensureLabel(ready.config, issued.token, match[1], match[2], `/repos/${match[1]}/${match[2]}/issues/${parsed[3]}`, status);
    return { url, labelError };
  } catch {
    return { error: "GitHub could not be reached." };
  }
}

function createdIssueUrl(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || !("html_url" in body)) return undefined;
  const url = (body as { html_url: unknown }).html_url;
  return typeof url === "string" ? canonicalIssueUrl(url) : undefined;
}

function bodyWithTrailer(body: string, line: string): string {
  const block = `<!-- goalie -->\n${line}\n<!-- /goalie -->`;
  if (TRAILER.test(body)) return body.replace(TRAILER, block);
  const base = body.replace(/\s*$/, "");
  return `${base}${base ? "\n\n" : ""}${block}\n`;
}

/** The installation GitHub reports for this repository. A non-200 lookup is the push failure. It must not fall back to GOALIE_GITHUB_INSTALLATION_ID. */
async function installationToken(config: GitHubConfig, owner: string, repo: string): Promise<{ token: string } | { error: string }> {
  const now = Math.floor(Date.now() / 1000);
  const appToken = signJwt(config.appId, config.privateKey, now - 60, now + 540);
  const lookup = `/repos/${owner}/${repo}/installation`;
  const found = await call(config, appToken, "GET", lookup);
  if (found.status !== 200) return { error: refused(found.status, `GET ${lookup}`, found.body) };
  const id = reportedInstallation(found.body);
  if (id === undefined) return { error: `GitHub answered ${found.status} for GET ${lookup} without an installation.` };
  const path = `/app/installations/${id}/access_tokens`;
  const response = await call(config, appToken, "POST", path);
  if (response.status !== 201 && response.status !== 200) return { error: refused(response.status, `POST ${path}`, response.body) };
  const issued = (response.body as { token?: unknown }).token;
  if (typeof issued !== "string" || issued === "") return { error: `GitHub answered ${response.status} for POST ${path} without a token.` };
  return { token: issued };
}

function reportedInstallation(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || !("id" in body)) return undefined;
  const id = (body as { id: unknown }).id;
  if (typeof id === "number" && Number.isInteger(id)) return String(id);
  if (typeof id === "string" && id !== "") return id;
  return undefined;
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
