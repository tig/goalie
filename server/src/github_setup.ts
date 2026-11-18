import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { forgetInstallationTokens, signJwt } from "./github.ts";

/**
 * Create GitHub App (issue #109). GitHub's App Manifest flow, so the GOALIE owner pastes no key.
 * 1. startSetup answers a manifest and the GitHub address the browser posts it to, with a one-time state.
 * 2. GitHub sends the browser to /github/created with a code. finishCreate checks the state, trades the code
 *    for the app id, the private key, and the webhook secret, and stores them in github_config.
 * 3. GitHub sends the browser to /github/installed with an installation id. finishInstall stores it only when
 *    GitHub says that installation belongs to the stored App.
 * github_setup holds the state and the last error. It is not an entity and not an Event. Neither is the save.
 */

/** A state is good for one hour, as GitHub's code is. */
export const SETUP_FOR_MS = 60 * 60 * 1000;

const web = () => (process.env.GOALIE_GITHUB_WEB?.trim() || "https://github.com").replace(/\/$/, "");
const api = () => (process.env.GOALIE_GITHUB_API?.trim() || "https://api.github.com").replace(/\/$/, "");

const ORG = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const USED = "That setup link was already used or is more than an hour old. Press Create GitHub App again.";

type Setup = { state: string | null; until: number | null; public_url: string | null; error: string | null };

function setupRow(db: DatabaseSync): Setup | undefined {
  return db.prepare("SELECT state, until, public_url, error FROM github_setup WHERE id = 'setup'").get() as Setup | undefined;
}

function remember(db: DatabaseSync, fields: Partial<Setup>): void {
  const row = { state: null, until: null, public_url: null, error: null, ...fields };
  db.prepare(
    `INSERT INTO github_setup (id, state, until, public_url, error) VALUES ('setup', ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET state = excluded.state, until = excluded.until, public_url = excluded.public_url, error = excluded.error`,
  ).run(row.state, row.until, row.public_url, row.error);
}

function fail(db: DatabaseSync, error: string): { ok: false } {
  remember(db, { error });
  return { ok: false };
}

/** An http or https URL with no path, query, or trailing slash. */
function cleanBase(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value.trim());
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.search !== "" || url.hash !== "" || (url.pathname !== "/" && url.pathname !== "")) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

/** True for a host only this machine or its network can reach. GitHub refuses such a notice address. */
export function privateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1" || host === "0.0.0.0") return true;
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n))) return false;
  const [a, b] = parts as [number, number, number, number];
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
}

/** The fields the page shows. No secret is in it. */
export function setupView(db: DatabaseSync): { appSlug: string | null; installUrl: string | null; webhookSecretSet: boolean; setupError: string | null } {
  const config = db.prepare("SELECT app_slug, installation_id, webhook_secret FROM github_config WHERE id = 'config'").get() as
    | { app_slug: string | null; installation_id: string | null; webhook_secret: string | null }
    | undefined;
  const slug = config?.app_slug ?? null;
  const installed = config?.installation_id !== null && config?.installation_id !== undefined && config.installation_id !== "";
  return {
    appSlug: slug,
    installUrl: slug !== null && !installed ? `${web()}/apps/${slug}/installations/new` : null,
    webhookSecretSet: (config?.webhook_secret ?? "") !== "",
    setupError: setupRow(db)?.error ?? null,
  };
}

/** The webhook secret Create GitHub App stored, or undefined. */
export function storedWebhookSecret(db: DatabaseSync): string | undefined {
  const row = db.prepare("SELECT webhook_secret FROM github_config WHERE id = 'config'").get() as { webhook_secret: string | null } | undefined;
  return row?.webhook_secret ? row.webhook_secret : undefined;
}

/**
 * The manifest and where to post it. publicUrl is where GitHub sends notices. returnTo is the address the owner's browser uses, so GitHub sends the browser back there.
 * An empty org is the owner's own account.
 */
export function startSetup(db: DatabaseSync, body: unknown, returnTo: string): { ok: true; action: string; manifest: string } | { ok: false; reason: string } {
  const row = typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const org = typeof row.org === "string" ? row.org.trim() : "";
  if (org !== "" && !ORG.test(org)) return { ok: false, reason: "The organization is its GitHub name, like excaliwire." };
  const publicUrl = cleanBase(row.publicUrl);
  if (publicUrl === undefined) return { ok: false, reason: "The public URL must be an http or https address with no path, like https://goalie.example.com." };
  if (privateHost(new URL(publicUrl).hostname)) return { ok: false, reason: `GitHub cannot reach ${new URL(publicUrl).host}. Use an address on the internet, like your deployment's or an ngrok address.` };
  const back = cleanBase(returnTo) ?? publicUrl;
  const state = randomBytes(24).toString("hex");
  remember(db, { state, until: Date.now() + SETUP_FOR_MS, public_url: publicUrl });
  const manifest = {
    name: `GOALIE ${new URL(publicUrl).hostname}`.slice(0, 34),
    url: publicUrl,
    hook_attributes: { url: `${publicUrl}/api/github/webhook`, active: true },
    redirect_url: `${back}/github/created`,
    setup_url: `${back}/github/installed`,
    setup_on_update: true,
    public: false,
    default_permissions: { issues: "write", pull_requests: "read", metadata: "read" },
    default_events: ["issues", "pull_request"],
  };
  const where = org === "" ? `${web()}/settings/apps/new` : `${web()}/organizations/${org}/settings/apps/new`;
  return { ok: true, action: `${where}?state=${state}`, manifest: JSON.stringify(manifest) };
}

/** Trade GitHub's code. The state is taken first, so a second use of the same link stores nothing. */
export async function finishCreate(db: DatabaseSync, code: string, state: string): Promise<{ ok: true; next: string } | { ok: false }> {
  const row = setupRow(db);
  const good = row !== undefined && row.state !== null && row.state === state && row.until !== null && Date.now() < row.until && /^[A-Za-z0-9_-]{1,200}$/.test(code);
  if (!good) return fail(db, USED);
  remember(db, {});
  const path = `/app-manifests/${code}/conversions`;
  let reply: Response;
  try {
    reply = await fetch(`${api()}${path}`, { method: "POST", headers: { accept: "application/vnd.github+json", "user-agent": "goalie" }, signal: AbortSignal.timeout(10_000) });
  } catch {
    return fail(db, "GitHub could not be reached. Press Create GitHub App again.");
  }
  const answer = (await reply.json().catch(() => ({}))) as Record<string, unknown>;
  if (reply.status !== 201) return fail(db, `GitHub answered ${reply.status} for POST ${path}. Press Create GitHub App again.`);
  const { id, slug, pem, webhook_secret: secret, client_id: clientId, client_secret: clientSecret } = answer;
  if (!Number.isInteger(id) || typeof slug !== "string" || !/^[a-z0-9-]+$/.test(slug) || typeof pem !== "string" || typeof secret !== "string") {
    return fail(db, `GitHub answered ${reply.status} for POST ${path} without an App. Press Create GitHub App again.`);
  }
  db.prepare(
    `INSERT INTO github_config (id, app_id, installation_id, public_url, private_key, webhook_secret, client_id, client_secret, app_slug) VALUES ('config', ?, NULL, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET app_id = excluded.app_id, installation_id = NULL, public_url = excluded.public_url, private_key = excluded.private_key,
       webhook_secret = excluded.webhook_secret, client_id = excluded.client_id, client_secret = excluded.client_secret, app_slug = excluded.app_slug`,
  ).run(String(id), row.public_url, pem, secret, typeof clientId === "string" ? clientId : null, typeof clientSecret === "string" ? clientSecret : null, slug);
  forgetInstallationTokens();
  return { ok: true, next: `${web()}/apps/${slug}/installations/new` };
}

/** Store the installation only when GitHub, asked as the stored App, says it is that App's. */
export async function finishInstall(db: DatabaseSync, installationId: string): Promise<void> {
  if (!/^\d{1,20}$/.test(installationId)) {
    fail(db, "GitHub sent no installation. Press Install on GitHub again.");
    return;
  }
  const config = db.prepare("SELECT app_id, private_key FROM github_config WHERE id = 'config'").get() as { app_id: string | null; private_key: string | null } | undefined;
  if (!config?.app_id || !config.private_key) {
    fail(db, "There is no App to install. Press Create GitHub App first.");
    return;
  }
  const path = `/app/installations/${installationId}`;
  let status: number;
  let answer: Record<string, unknown> = {};
  try {
    const now = Math.floor(Date.now() / 1000);
    const token = signJwt(config.app_id, config.private_key, now - 60, now + 540);
    const reply = await fetch(`${api()}${path}`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "user-agent": "goalie" },
      signal: AbortSignal.timeout(10_000),
    });
    status = reply.status;
    answer = (await reply.json().catch(() => ({}))) as Record<string, unknown>;
  } catch {
    fail(db, "GitHub could not be reached. Press Install on GitHub again.");
    return;
  }
  if (status !== 200 || String(answer.app_id) !== config.app_id) {
    fail(db, `GitHub answered ${status} for GET ${path}, so that installation is not this App's.`);
    return;
  }
  db.prepare("UPDATE github_config SET installation_id = ? WHERE id = 'config'").run(installationId);
  forgetInstallationTokens();
  remember(db, {});
}
