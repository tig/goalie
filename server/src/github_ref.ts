import type { DatabaseSync } from "node:sqlite";
import type { GitHubRef } from "./api.ts";

/**
 * What GitHub last said about one issue or pull request in scope (issue #109).
 * github_ref is not an entity and not an Event. A signed notice or a read fills it. A push to an issue drops it.
 * The key is the repository, without case, and the number. An issue and a pull request share GitHub's numbers.
 */

/** A read uses a row younger than this. An older row is read again from GitHub. */
export const REF_FRESH_MS = 5 * 60 * 1000;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** A ref and GitHub's updated_at, or undefined when the object is not one. */
type Read = { ref: GitHubRef; updatedAt: string | null };

function common(row: Record<string, unknown>): { title: string; state: "open" | "closed"; draft: boolean; updatedAt: string | null } | undefined {
  if (typeof row.title !== "string" || row.title === "" || (row.state !== "open" && row.state !== "closed")) return undefined;
  return { title: row.title, state: row.state, draft: row.draft === true, updatedAt: typeof row.updated_at === "string" ? row.updated_at : null };
}

/** GET /repos/{owner}/{repo}/issues/{n}, or the `issue` of an `issues` notice. A pull request carries `pull_request`, with `merged_at` once merged. */
export function refFromIssue(body: unknown): Read | undefined {
  if (!isObject(body)) return undefined;
  const base = common(body);
  if (base === undefined) return undefined;
  const pull = isObject(body.pull_request) ? body.pull_request : undefined;
  const merged = pull !== undefined && typeof pull.merged_at === "string" && pull.merged_at !== "";
  return { ref: { title: base.title, state: base.state, kind: pull === undefined ? "issue" : "pull", merged, draft: base.draft }, updatedAt: base.updatedAt };
}

/** The `pull_request` of a `pull_request` notice. */
export function refFromPull(body: unknown): Read | undefined {
  if (!isObject(body)) return undefined;
  const base = common(body);
  if (base === undefined) return undefined;
  return { ref: { title: base.title, state: base.state, kind: "pull", merged: body.merged === true, draft: base.draft }, updatedAt: base.updatedAt };
}

/** Store a read. A row whose updated_at is later than this one stays. */
export function rememberRef(db: DatabaseSync, repo: string, number: number, read: Read, now = Date.now()): void {
  const { ref, updatedAt } = read;
  db.prepare(
    `INSERT INTO github_ref (repo, number, kind, title, state, merged, draft, updated_at, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (repo, number) DO UPDATE SET kind = excluded.kind, title = excluded.title, state = excluded.state, merged = excluded.merged,
       draft = excluded.draft, updated_at = excluded.updated_at, fetched_at = excluded.fetched_at
     WHERE excluded.updated_at IS NULL OR github_ref.updated_at IS NULL OR excluded.updated_at >= github_ref.updated_at`,
  ).run(repo.toLowerCase(), number, ref.kind, ref.title, ref.state, ref.merged ? 1 : 0, ref.draft ? 1 : 0, updatedAt, now);
}

/** The stored ref when it is younger than REF_FRESH_MS. */
export function freshRef(db: DatabaseSync, repo: string, number: number, now = Date.now()): GitHubRef | undefined {
  const row = db.prepare("SELECT kind, title, state, merged, draft, fetched_at FROM github_ref WHERE repo = ? AND number = ?").get(repo.toLowerCase(), number) as
    | { kind: "issue" | "pull"; title: string; state: "open" | "closed"; merged: number; draft: number; fetched_at: number }
    | undefined;
  if (row === undefined || now - row.fetched_at >= REF_FRESH_MS) return undefined;
  return { title: row.title, state: row.state, kind: row.kind, merged: row.merged === 1, draft: row.draft === 1 };
}

/** Drop one issue, so the next read asks GitHub. url is an issue or pull request URL. */
export function forgetRef(db: DatabaseSync, url: string): void {
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:issues|pull)\/(\d+)/i.exec(url);
  if (match === null || match[1] === undefined || match[2] === undefined || match[3] === undefined) return;
  db.prepare("DELETE FROM github_ref WHERE repo = ? AND number = ?").run(`${match[1]}/${match[2]}`.toLowerCase(), Number(match[3]));
}

/** A signed `issues` or `pull_request` notice for a repository the caller already found in scope. Anything else stores nothing. */
export function rememberNotice(db: DatabaseSync, event: string | undefined, payload: unknown, inScope: (repo: string) => boolean): void {
  if (!isObject(payload) || !isObject(payload.repository)) return;
  const repo = payload.repository.full_name;
  if (typeof repo !== "string" || !inScope(repo)) return;
  const body = event === "issues" ? payload.issue : event === "pull_request" ? payload.pull_request : undefined;
  if (!isObject(body) || !Number.isInteger(body.number) || (body.number as number) < 1) return;
  const read = event === "issues" ? refFromIssue(body) : refFromPull(body);
  if (read !== undefined) rememberRef(db, repo, body.number as number, read);
}
