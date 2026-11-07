import { createPrivateKey, createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import type { GitHubRefResponse, GitHubSearchItem, GitHubStatusResponse } from "./api.ts";
import { configuredTimeZone, configuredToday } from "./config.ts";
import { read } from "./read.ts";
import type { Row } from "./rules.ts";

/**
 * Push a work item's status to one linked GitHub issue (issue #72, ADR 0012).
 * A committed change of due_date queues that same push. The push sets the issue's Target date from the work item's due_date, read after the issue PATCH. due_date is not stored on the push row. A null due_date does not set a date. A missing field list does not fail the push. A field list that fails does, and the work item stays committed. Start date stays unset. A pull request is not dated.
 * The repository must be in the owner setting github_repos and on the work item's goal.
 * github_push is not an entity and not an Event. The row is written in the work item's transaction.
 * The call to GitHub runs after that transaction commits. A failure stays on the row and shows on the work item.
 * Add as Github Issue writes the request in the work item's transaction: an empty issue, the repository, and the actor. drain opens the issue after that transaction commits, then the link write records the issue URL. The current status is queued after that write so this drain sends it. That push includes the work item's current title. A failed create sets error on this row so a later drain does not send it as a status push.
 * Attach writes a row in that same transaction when a create or a title update has a # and no issue URL. drain searches after the commit, appends the first issue, and queues the current status for this drain. A pull request is not that issue. The search does not run inside the transaction, and a later status change does not search. A title whose # query changed during the search is not linked and is not queued. A repository that leaves github_repos or the goal during the search is not linked and is not queued. A failed create keeps its error until an issue is attached. The failure is written back only when the work item still has no issue link and no newer push row exists. A search that does not complete records that failure and does not put the request back. A missing GitHub setting records that failure and does not attach. A later status change does not clear that failure.
 * A work-item update that adds an issue URL in github_repos and on the goal, when that URL was not in the previous links, queues the current status on that URL. A pull request does not. That queue is the status push. A write that adds more than one new in-scope issue is refused before it is stored. A URL already in the previous links does not count. On create, every link is new.
 * github_result is not an entity and not an Event. It keeps the last update and the last signed notice.
 * github_config is not an entity and not an Event. It keeps the app id, the installation id, the private key, and the public URL. A value not stored there uses the process name. The private key stays out of the status view.
 */

const STATUS_LABELS = ["Backlog", "In Progress", "Completed", "Deleted"] as const;
const ISSUE_API = "2022-11-28";
const FIELD_API = "2026-03-10";
const ISSUE_URL = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)\/?$/;
const PULL_URL = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/;
const REF_URL = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:issues|pull)\/(\d+)\/?(?:[?#].*)?$/;
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

/** The request to open an issue, in the same transaction as the work item. The issue stays empty until drain opens it. */
export function queueGitHubCreate(db: DatabaseSync, after: Row, repo: string, actor: string): void {
  const id = after.id;
  const status = after.status;
  const goal = after.goal;
  if (typeof id !== "string" || typeof status !== "string" || typeof goal !== "string" || repo === "") return;
  db.prepare(
    `INSERT INTO github_push (work_item, issue, status, goal, error, repo, actor) VALUES (?, '', ?, ?, NULL, ?, ?)
     ON CONFLICT(work_item) DO UPDATE SET issue = '', status = excluded.status, goal = excluded.goal, error = NULL, repo = excluded.repo, actor = excluded.actor`,
  ).run(id, status, goal, repo, actor);
}

/**
 * Record the push for a committed status or due_date change, in the same transaction as the Event.
 * The linked issue's repository must be in github_repos and on the work item's goal.
 * No linked issue deletes a row whose issue is not empty. An empty issue stays: a create request, or a failed create.
 * A linked issue replaces the row and clears the error. That push leaves repo and actor empty.
 * issue, when passed, is the row's issue. The first linked issue is used only when it is omitted.
 */
export function queueGitHubPush(db: DatabaseSync, after: Row, issue?: string): void {
  const id = after.id;
  if (typeof id !== "string") return;
  const goalRow = typeof after.goal === "string" ? read(db, "goal", after.goal) : undefined;
  const linked = issue ?? linkedIssue(after.links, githubRepos(db), goalRepos(goalRow?.work_product));
  if (linked === undefined) {
    db.prepare("DELETE FROM github_push WHERE work_item = ? AND issue <> ''").run(id);
    return;
  }
  const status = after.status;
  const goal = after.goal;
  if (typeof status !== "string" || typeof goal !== "string") return;
  db.prepare(
    `INSERT INTO github_push (work_item, issue, status, goal, error, repo, actor) VALUES (?, ?, ?, ?, NULL, NULL, NULL)
     ON CONFLICT(work_item) DO UPDATE SET issue = excluded.issue, status = excluded.status, goal = excluded.goal, error = NULL, repo = NULL, actor = NULL`,
  ).run(id, linked, status, goal);
}

/** Canonical issue URLs in links, in order. A pull request is not one. */
function issueUrls(links: unknown): string[] {
  if (!Array.isArray(links)) return [];
  const out: string[] = [];
  for (const link of links) {
    if (typeof link !== "string") continue;
    const url = canonicalIssueUrl(link);
    if (url !== undefined) out.push(url);
  }
  return out;
}

/**
 * New in-scope issue URLs this write adds, in link order.
 * A pull request is not one. A URL already in the previous links is not one. On create, every link is new.
 */
export function addedInScopeIssues(db: DatabaseSync, before: Row | undefined, after: Row): string[] {
  const previous = new Set(issueUrls(before?.links).map((url) => url.toLowerCase()));
  const goalRow = typeof after.goal === "string" ? read(db, "goal", after.goal) : undefined;
  const scopes = githubRepos(db);
  const onGoal = goalRepos(goalRow?.work_product);
  const added: string[] = [];
  const seen = new Set<string>();
  for (const url of issueUrls(after.links)) {
    const key = url.toLowerCase();
    if (previous.has(key) || seen.has(key)) continue;
    const match = ISSUE_URL.exec(url);
    if (match === null) continue;
    const repo = `${match[1]}/${match[2]}`;
    if (!onGoal.has(repo.toLowerCase()) || !repoInScope(repo, scopes)) continue;
    seen.add(key);
    added.push(url);
  }
  return added;
}

/**
 * A work-item update that adds an issue URL in github_repos and on the goal queues the current status.
 * That URL was not in the previous links. A pull request does not. The row's issue is that URL.
 * It returns after the first new in-scope issue. A refused write never reaches it.
 */
export function queueGitHubIssueLink(db: DatabaseSync, before: Row | undefined, after: Row): void {
  if (before === undefined) return;
  const url = addedInScopeIssues(db, before, after)[0];
  if (url === undefined) return;
  queueGitHubPush(db, after, url);
}

/** The text of the first # in title, up to whitespace. Undefined when there is no such token. */
export function hashQuery(title: string): string | undefined {
  return /#(\S+)/.exec(title)?.[1];
}

/** True when links already hold a GitHub issue URL. A pull request is not one. */
export function hasIssueUrl(links: unknown): boolean {
  return Array.isArray(links) && links.some((link) => typeof link === "string" && canonicalIssueUrl(link) !== undefined);
}

/**
 * Ask drain to attach the first issue for this title. The row is an empty issue with an actor and no repository, so it is not a create request and not a status push.
 * An issue URL already in links, a title with no #, or a create request for this work item writes nothing.
 * A failed create keeps its error until an issue is attached. The failure is written back only when the work item still has no issue link and no newer push row exists.
 */
export function queueGitHubAttach(db: DatabaseSync, after: Row, actor: string): void {
  const id = after.id;
  const title = after.title;
  const status = after.status;
  const goal = after.goal;
  if (typeof id !== "string" || typeof title !== "string" || typeof status !== "string" || typeof goal !== "string" || actor === "") return;
  if (hasIssueUrl(after.links) || hashQuery(title) === undefined) return;
  const pending = db.prepare("SELECT issue, repo FROM github_push WHERE work_item = ?").get(id) as { issue: string; repo: string | null } | undefined;
  if (pending !== undefined && pending.issue === "" && typeof pending.repo === "string" && pending.repo !== "") return;
  db.prepare(
    `INSERT INTO github_push (work_item, issue, status, goal, error, repo, actor) VALUES (?, '', ?, ?, NULL, NULL, ?)
     ON CONFLICT(work_item) DO UPDATE SET issue = '', status = excluded.status, goal = excluded.goal, repo = NULL, actor = excluded.actor`,
  ).run(id, status, goal, actor);
}

/** Take one attach request, including a failed create that still shows. Undefined when another drain took it, or it is no longer an attach request. The error is that failure, or null. */
export function claimGitHubAttach(db: DatabaseSync, workItem: string): { actor: string; error: string | null } | undefined {
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db.prepare(
      "SELECT actor, error FROM github_push WHERE work_item = ? AND issue = '' AND (repo IS NULL OR repo = '') AND actor IS NOT NULL AND actor <> ''",
    ).get(workItem) as { actor: string; error: string | null } | undefined;
    if (row === undefined) {
      db.exec("COMMIT");
      return undefined;
    }
    db.prepare("DELETE FROM github_push WHERE work_item = ? AND issue = '' AND (repo IS NULL OR repo = '')").run(workItem);
    db.exec("COMMIT");
    return { actor: row.actor, error: row.error ?? null };
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}

/** Send every pending push. Call this only after the work item transaction has committed. Attach runs first: the search is outside any transaction, then the link write queues the status this drain sends. A create request has an empty issue, no error, and a repository: open it here, and do not delete it as out of scope. Then send status pushes, including one the create or the attach just queued. A status row whose repository is not in github_repos and on the work item's current goal is deleted and not sent. A failed create has an empty issue and an error: do not send it. An attach request keeps that error until an issue is attached. */
export async function drainGitHub(db: DatabaseSync): Promise<void> {
  const { attachGitHubIssues } = await import("./commands.ts");
  await attachGitHubIssues(db, configuredToday(configuredTimeZone(db)));
  await openPendingIssues(db);
  const pending = db.prepare("SELECT work_item, issue, status, goal FROM github_push WHERE error IS NULL AND issue <> ''").all() as PushRow[];
  if (pending.length === 0) return;
  const ready = configuredGitHub(db);
  for (const row of pending) {
    if (!pushInScope(db, row)) {
      db.prepare("DELETE FROM github_push WHERE work_item = ?").run(row.work_item);
      continue;
    }
    let error: string | null;
    try {
      error = ready.ok ? await push(db, ready.config, row) : ready.error;
    } catch {
      error = "GitHub could not be reached.";
    }
    const detail = error === null ? updatedDetail(row) : error.slice(0, 500);
    recordGitHubResult(db, "outbound", error === null, detail);
    if (error === null) db.prepare("DELETE FROM github_push WHERE work_item = ?").run(row.work_item);
    else db.prepare("UPDATE github_push SET error = ? WHERE work_item = ?").run(detail, row.work_item);
  }
}

type CreateRow = { work_item: string; repo: string; actor: string | null };

/** Open each committed create request. A link already in that repository is not opened again. Its current status is queued instead. The row is taken before the call so a second drain does not open a second issue. commands.ts imports this module, so the opener is loaded here. */
async function openPendingIssues(db: DatabaseSync): Promise<void> {
  const rows = db.prepare(
    "SELECT work_item, repo, actor FROM github_push WHERE error IS NULL AND issue = '' AND repo IS NOT NULL AND repo <> ''",
  ).all() as CreateRow[];
  if (rows.length === 0) return;
  const { fileGitHubIssue } = await import("./commands.ts");
  const today = configuredToday(configuredTimeZone(db));
  for (const row of rows) {
    const item = read(db, "work_item", row.work_item);
    if (item !== undefined && namesIssueInRepo(item.links, row.repo)) {
      queueGitHubPush(db, item);
      continue;
    }
    const claimed = claimCreate(db, row.work_item);
    if (claimed === undefined) continue;
    await fileGitHubIssue(db, claimed.actor, row.work_item, claimed.repo, today);
  }
}

/** Take one create request. Undefined when another drain took it, or it is no longer a create request. */
function claimCreate(db: DatabaseSync, workItem: string): { repo: string; actor: string } | undefined {
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db.prepare(
      "SELECT repo, actor FROM github_push WHERE work_item = ? AND issue = '' AND error IS NULL AND repo IS NOT NULL AND repo <> ''",
    ).get(workItem) as { repo: string; actor: string | null } | undefined;
    if (row === undefined || typeof row.actor !== "string" || row.actor === "") {
      db.exec("COMMIT");
      return undefined;
    }
    db.prepare("DELETE FROM github_push WHERE work_item = ? AND issue = '' AND error IS NULL").run(workItem);
    db.exec("COMMIT");
    return { repo: row.repo, actor: row.actor };
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}

/** True when links already name an issue in repo. The names compare without case. */
function namesIssueInRepo(links: unknown, repo: string): boolean {
  if (!Array.isArray(links)) return false;
  const want = repo.toLowerCase();
  for (const link of links) {
    if (typeof link !== "string") continue;
    const url = canonicalIssueUrl(link);
    if (url === undefined) continue;
    const match = ISSUE_URL.exec(url);
    if (match !== null && `${match[1]}/${match[2]}`.toLowerCase() === want) return true;
  }
  return false;
}

/** The issue's repository is in github_repos and on the work item's current goal. */
function pushInScope(db: DatabaseSync, row: PushRow): boolean {
  const match = ISSUE_URL.exec(row.issue);
  if (match === null) return false;
  const repo = `${match[1]}/${match[2]}`;
  return repoInScope(repo, githubRepos(db)) && goalNamesRepo(db, read(db, "work_item", row.work_item)?.goal, repo);
}

/** The last update and the last signed notice. The stored app id, installation id, and public URL are included. The private key stays out. The list is github_repos. */
export function githubView(db: DatabaseSync): GitHubStatusResponse {
  const stored = storedGitHub(db);
  return {
    configured: configuredGitHub(db).ok,
    repositories: githubRepos(db),
    outbound: storedResult(db, "outbound"),
    inbound: storedResult(db, "inbound"),
    appId: stored.appId,
    installationId: stored.installationId,
    publicUrl: stored.publicUrl,
    privateKeySet: stored.privateKey !== null,
  };
}

/** Store the four values. A blank private key leaves the stored key. An empty app id, installation id, or public URL removes that stored value. This is not an Event. */
export function saveGitHubSettings(db: DatabaseSync, body: unknown): { ok: true } | { ok: false; reason: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false, reason: SETTINGS_REASON };
  const row = body as Record<string, unknown>;
  if (typeof row.appId !== "string" || typeof row.installationId !== "string" || typeof row.publicUrl !== "string" || typeof row.privateKey !== "string") return { ok: false, reason: SETTINGS_REASON };
  const appId = cleanId(row.appId);
  if (appId === "bad") return { ok: false, reason: "The app id is a number." };
  const installationId = cleanId(row.installationId);
  if (installationId === "bad") return { ok: false, reason: "The installation id is a number." };
  const publicUrl = cleanPublicUrl(row.publicUrl);
  if (publicUrl === "bad") return { ok: false, reason: "The public URL must be an http or https URL." };
  const privateKey = cleanKey(row.privateKey);
  if (privateKey === "bad") return { ok: false, reason: "The private key must be a PEM private key." };
  db.prepare(
    `INSERT INTO github_config (id, app_id, installation_id, public_url, private_key) VALUES ('config', ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET app_id = excluded.app_id, installation_id = excluded.installation_id, public_url = excluded.public_url,
       private_key = CASE WHEN ? = 1 THEN github_config.private_key ELSE excluded.private_key END`,
  ).run(appId, installationId, publicUrl, privateKey === "keep" ? null : privateKey, privateKey === "keep" ? 1 : 0);
  installationTokens.clear();
  return { ok: true };
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

/** `owner/repo` from a GitHub issue URL, or undefined when link is not one. A trailing slash is the same issue. */
export function issueUrlRepo(link: string): string | undefined {
  const url = canonicalIssueUrl(link);
  if (url === undefined) return undefined;
  const match = ISSUE_URL.exec(url);
  if (match === null) return undefined;
  return `${match[1]}/${match[2]}`;
}

/** `owner/repo` from a GitHub issue URL or a pull request URL. Any other link is undefined. A trailing slash is the same link. */
export function linkUrlRepo(link: string): string | undefined {
  const issue = issueUrlRepo(link);
  if (issue !== undefined) return issue;
  const match = PULL_URL.exec(link);
  if (match === null) return undefined;
  return `${match[1]}/${match[2]}`;
}

/** The pull request URL in canonical form, or undefined when link is not one. A trailing slash is the same pull request. */
function canonicalPullUrl(link: string): string | undefined {
  const match = PULL_URL.exec(link);
  if (match === null) return undefined;
  return `https://github.com/${match[1]}/${match[2]}/pull/${match[3]}`;
}

/**
 * Issues and pull requests in the repositories this goal names that github_repos covers.
 * One installation token per repository. It does not fall back to GOALIE_GITHUB_INSTALLATION_ID.
 * Empty q returns nothing and does not call GitHub. A goal with no repository completes with no items and no error.
 * A missing setting returns that error and does not call GitHub. A repository outside that set contributes nothing.
 * A token error or a throw is "GitHub could not be reached." A non-200 is that answer. The first repository that does not complete supplies error. Items from repositories that complete are still returned.
 */
export async function searchGitHub(db: DatabaseSync, goalId: string, q: string): Promise<{ items: GitHubSearchItem[]; error: string | null }> {
  const text = q.trim();
  if (text === "") return { items: [], error: null };
  const repos = reposOnGoal(db, goalId);
  if (repos.length === 0) return { items: [], error: null };
  const ready = configuredGitHub(db);
  if (!ready.ok) return { items: [], error: ready.error };
  const items: GitHubSearchItem[] = [];
  const seen = new Set<string>();
  let error: string | null = null;
  for (const repo of repos) {
    const match = SCOPE_ENTRY.exec(repo);
    if (match === null || match[2] === "*") continue;
    try {
      const issued = await installationToken(ready.config, match[1], match[2]);
      if ("error" in issued) {
        error ??= "GitHub could not be reached.";
        continue;
      }
      const path = `/search/issues?q=${encodeURIComponent(`repo:${match[1]}/${match[2]} ${text}`)}`;
      const found = await call(ready.config, issued.token, "GET", path);
      if (found.status !== 200) {
        error ??= refused(found.status, `GET ${path}`, found.body);
        continue;
      }
      for (const item of searchItems(found.body, `${match[1]}/${match[2]}`)) {
        if (seen.has(item.url)) continue;
        seen.add(item.url);
        items.push(item);
      }
    } catch {
      error ??= "GitHub could not be reached.";
    }
  }
  return { items, error };
}

export type GitHubRefResult = { status: 200; body: GitHubRefResponse } | { status: 404; reason: string };

/**
 * The title and state of one issue or pull request. GET /repos/{owner}/{repo}/issues/{n} returns a pull request too.
 * A URL that is not an issue or pull request in github_repos and on that goal is 404 and does not call GitHub.
 * This read is not stored on the work item and does not write github_push. A failed read does not invent open or closed.
 */
export async function readGitHubRef(db: DatabaseSync, goalId: string, url: string): Promise<GitHubRefResult> {
  const match = REF_URL.exec(url.trim());
  if (match === null || match[1] === undefined || match[2] === undefined || match[3] === undefined) return { status: 404, reason: "that URL is not a GitHub issue or pull request" };
  const owner = match[1];
  const repo = match[2];
  const number = match[3];
  if (!issueRepoAllowed(db, goalId, `${owner}/${repo}`)) return { status: 404, reason: "that repository is not on this goal" };
  const ready = configuredGitHub(db);
  if (!ready.ok) return { status: 200, body: { error: ready.error } };
  const path = `/repos/${owner}/${repo}/issues/${number}`;
  try {
    const issued = await installationToken(ready.config, owner, repo);
    if ("error" in issued) return { status: 200, body: { error: issued.error } };
    const found = await call(ready.config, issued.token, "GET", path);
    if (found.status === 404) return { status: 404, reason: "GitHub has no such issue" };
    if (found.status !== 200) return { status: 200, body: { error: refused(found.status, `GET ${path}`, found.body) } };
    const row = found.body as { title?: unknown; state?: unknown };
    if (typeof row.title !== "string" || row.title === "" || (row.state !== "open" && row.state !== "closed")) {
      return { status: 200, body: { error: refused(found.status, `GET ${path}`, found.body) } };
    }
    return { status: 200, body: { title: row.title, state: row.state } };
  } catch {
    return { status: 200, body: { error: "GitHub could not be reached." } };
  }
}

/** Search hits whose URL is an issue or a pull request in repo. Other hits are dropped. Order is the order GitHub returned. */
function searchItems(body: unknown, repo: string): GitHubSearchItem[] {
  if (typeof body !== "object" || body === null || !("items" in body) || !Array.isArray((body as { items: unknown }).items)) return [];
  const want = repo.toLowerCase();
  const out: GitHubSearchItem[] = [];
  for (const hit of (body as { items: unknown[] }).items) {
    if (typeof hit !== "object" || hit === null) continue;
    const row = hit as { html_url?: unknown; title?: unknown };
    if (typeof row.html_url !== "string" || typeof row.title !== "string") continue;
    const issue = canonicalIssueUrl(row.html_url);
    const pull = issue === undefined ? canonicalPullUrl(row.html_url) : undefined;
    const url = issue ?? pull;
    if (url === undefined) continue;
    const parsed = (issue === undefined ? PULL_URL : ISSUE_URL).exec(url);
    if (parsed === null || `${parsed[1]}/${parsed[2]}`.toLowerCase() !== want) continue;
    out.push({ kind: issue === undefined ? "pull" : "issue", title: row.title, url });
  }
  return out;
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

const SETTINGS_REASON = "GitHub settings are the app id, the installation id, the private key, and the public URL.";

type StoredGitHub = { appId: string | null; installationId: string | null; publicUrl: string | null; privateKey: string | null };

function storedText(value: string | null): string | null {
  if (value === null || value.trim() === "") return null;
  return value;
}

function storedGitHub(db: DatabaseSync): StoredGitHub {
  const row = db.prepare("SELECT app_id, installation_id, public_url, private_key FROM github_config WHERE id = 'config'").get() as
    | { app_id: string | null; installation_id: string | null; public_url: string | null; private_key: string | null }
    | undefined;
  if (row === undefined) return { appId: null, installationId: null, publicUrl: null, privateKey: null };
  return { appId: storedText(row.app_id), installationId: storedText(row.installation_id), publicUrl: storedText(row.public_url), privateKey: storedText(row.private_key) };
}

function cleanId(value: string): string | null | "bad" {
  const text = value.trim();
  if (text === "") return null;
  return /^\d+$/.test(text) ? text : "bad";
}

function cleanPublicUrl(value: string): string | null | "bad" {
  const text = value.trim().replace(/\/$/, "");
  if (text === "") return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return "bad";
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") return "bad";
  return text;
}

function cleanKey(value: string): string | "keep" | "bad" {
  const text = value.replace(/^\uFEFF/, "").trim();
  if (text === "") return "keep";
  const begin = /-----BEGIN (RSA )?PRIVATE KEY-----/.exec(text);
  const end = /-----END (RSA )?PRIVATE KEY-----/.exec(text);
  const candidates: string[] = [];
  if (begin !== null && end !== null && begin.index < end.index) {
    if ((begin[1] ?? "") !== (end[1] ?? "")) return "bad";
    const body = text.slice(begin.index + begin[0].length, end.index).replace(/[^A-Za-z0-9+/=]/g, "");
    if (body !== "") candidates.push(armor(begin[0], end[0], body));
  } else if (!text.includes("-----")) {
    const body = text.replace(/[^A-Za-z0-9+/=]/g, "");
    if (body !== "") {
      candidates.push(armor("-----BEGIN RSA PRIVATE KEY-----", "-----END RSA PRIVATE KEY-----", body));
      candidates.push(armor("-----BEGIN PRIVATE KEY-----", "-----END PRIVATE KEY-----", body));
    }
  }
  for (const pem of candidates) {
    if (rsaKey(pem)) return pem;
  }
  return "bad";
}

function armor(header: string, footer: string, body: string): string {
  const lines = body.match(/.{1,64}/g) ?? [];
  return `${header}\n${lines.join("\n")}\n${footer}\n`;
}

function rsaKey(pem: string): boolean {
  try {
    const key = createPrivateKey(pem);
    if (key.asymmetricKeyType !== "rsa") return false;
    const signer = createSign("RSA-SHA256");
    signer.update("goalie");
    signer.sign(key);
    return true;
  } catch {
    return false;
  }
}

function configuredGitHub(db: DatabaseSync): Ready {
  const stored = storedGitHub(db);
  const appId = stored.appId ?? process.env.GOALIE_GITHUB_APP_ID?.trim() ?? "";
  const installationId = stored.installationId ?? process.env.GOALIE_GITHUB_INSTALLATION_ID?.trim() ?? "";
  const publicUrl = (stored.publicUrl ?? process.env.GOALIE_PUBLIC_URL?.trim() ?? "").replace(/\/$/, "");
  const missing: string[] = [];
  if (appId === "") missing.push("GOALIE_GITHUB_APP_ID");
  if (installationId === "") missing.push("GOALIE_GITHUB_INSTALLATION_ID");
  const keyFile = process.env.GOALIE_GITHUB_PRIVATE_KEY_FILE?.trim() ?? "";
  if (stored.privateKey === null && keyFile === "") missing.push("GOALIE_GITHUB_PRIVATE_KEY_FILE");
  if (publicUrl === "") missing.push("GOALIE_PUBLIC_URL");
  if (missing.length > 0) return { ok: false, error: `GitHub is not configured. Missing ${missing.join(", ")}.` };
  let privateKey = stored.privateKey;
  if (privateKey === null) {
    try {
      privateKey = readFileSync(keyFile, "utf8");
    } catch {
      return { ok: false, error: "GitHub is not configured. The private key file could not be read." };
    }
  }
  return {
    ok: true,
    config: {
      appId,
      privateKey,
      api: (process.env.GOALIE_GITHUB_API?.trim() || "https://api.github.com").replace(/\/$/, ""),
      publicUrl,
    },
  };
}

/** Push one issue. Null when GitHub accepted it. The title on the PATCH is the work item's title at that call. The Target date is the work item's due_date, read after that PATCH. */
async function push(db: DatabaseSync, config: GitHubConfig, row: PushRow): Promise<string | null> {
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
    const title = read(db, "work_item", row.work_item)?.title;
    if (typeof title === "string") patch.title = title;
    const saved = await call(config, token, "PATCH", path, patch);
    if (saved.status !== 200) return refused(saved.status, `PATCH ${path}`, saved.body);
    return await pushTargetDate(db, config, token, parsed[1], path, row.work_item);
  } catch {
    return "GitHub could not be reached.";
  }
}

/** The issue's Target date. A null due_date sets nothing. A 404 list sets nothing. Any other status fails the push. The work item stays committed. Issue calls stay on ISSUE_API. These two calls use FIELD_API. */
async function pushTargetDate(db: DatabaseSync, config: GitHubConfig, token: string, owner: string, issuePath: string, workItem: string): Promise<string | null> {
  const due = read(db, "work_item", workItem)?.due_date;
  if (typeof due !== "string") return null;
  const listPath = `/orgs/${owner}/issue-fields?per_page=100`;
  const listed = await call(config, token, "GET", listPath, undefined, FIELD_API);
  if (listed.status === 404) return null;
  if (listed.status !== 200) return refused(listed.status, `GET ${listPath}`, listed.body);
  const field = targetDateId(listed.body);
  if (field === undefined) return null;
  const setPath = `${issuePath}/issue-field-values`;
  const posted = await call(config, token, "POST", setPath, { issue_field_values: [{ field_id: field, value: due }] }, FIELD_API);
  return posted.status === 200 || posted.status === 201 ? null : refused(posted.status, `POST ${setPath}`, posted.body);
}

/** The first date field named Target date, or none. Start date is not it. Another data_type is not it. */
function targetDateId(body: unknown): number | undefined {
  if (!Array.isArray(body)) return undefined;
  for (const field of body) {
    if (typeof field !== "object" || field === null) continue;
    const row = field as { id?: unknown; name?: unknown; data_type?: unknown };
    if (typeof row.name !== "string" || row.name.trim().toLowerCase() !== "target date") continue;
    if (row.data_type !== "date") continue;
    if (typeof row.id !== "number" || !Number.isInteger(row.id)) continue;
    return row.id;
  }
  return undefined;
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

/** Open one issue. The caller writes the URL onto the work item after this returns. A failure of the create has no URL. A label failure still returns the URL. */
export async function createGitHubIssue(db: DatabaseSync, workItemId: string, repo: string): Promise<OpenedIssue> {
  const item = read(db, "work_item", workItemId);
  if (item === undefined) return { error: `no work item ${workItemId}` };
  if (!issueRepoAllowed(db, item.goal, repo)) return { error: `${repo} is not in scope on this goal.` };
  const ready = configuredGitHub(db);
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
    try {
      const labelError = await ensureLabel(ready.config, issued.token, match[1], match[2], `/repos/${match[1]}/${match[2]}/issues/${parsed[3]}`, status);
      return { url, labelError };
    } catch {
      return { url, labelError: "GitHub could not be reached." };
    }
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

/** Kept per installation id until 50 minutes after it was issued. A different repository still looks up its own installation. A new server process starts empty. */
const installationTokens = new Map<string, { token: string; until: number }>();
const TOKEN_FOR_MS = 50 * 60 * 1000;

/** The installation GitHub reports for this repository. A non-200 lookup is the push failure. It must not fall back to GOALIE_GITHUB_INSTALLATION_ID. */
async function installationToken(config: GitHubConfig, owner: string, repo: string): Promise<{ token: string } | { error: string }> {
  const now = Math.floor(Date.now() / 1000);
  const appToken = signJwt(config.appId, config.privateKey, now - 60, now + 540);
  const lookup = `/repos/${owner}/${repo}/installation`;
  const found = await call(config, appToken, "GET", lookup);
  if (found.status !== 200) return { error: refused(found.status, `GET ${lookup}`, found.body) };
  const id = reportedInstallation(found.body);
  if (id === undefined) return { error: `GitHub answered ${found.status} for GET ${lookup} without an installation.` };
  const cached = installationTokens.get(id);
  if (cached !== undefined && Date.now() < cached.until) return { token: cached.token };
  const path = `/app/installations/${id}/access_tokens`;
  const response = await call(config, appToken, "POST", path);
  if (response.status !== 201 && response.status !== 200) return { error: refused(response.status, `POST ${path}`, response.body) };
  const issued = (response.body as { token?: unknown }).token;
  if (typeof issued !== "string" || issued === "") return { error: `GitHub answered ${response.status} for POST ${path} without a token.` };
  installationTokens.set(id, { token: issued, until: Date.now() + TOKEN_FOR_MS });
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

async function call(config: GitHubConfig, token: string, method: string, path: string, body?: unknown, version = ISSUE_API): Promise<Reply> {
  const response = await fetch(`${config.api}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "user-agent": "goalie",
      "x-github-api-version": version,
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
