import { createPublicKey, verify, type JsonWebKey, type KeyObject } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { readActorByToken } from "./read.ts";
import type { Row } from "./rules.ts";

/**
 * Map a request to one actor (ADR 0005). Every request must carry a token this process verifies.
 * A forwarded header is read only beside a verified token.
 */

/** One trusted issuer. Keys come from `jwks`, else `jwks_uri`, else the issuer's OpenID discovery document. */
export type Issuer = { issuer: string; audience: string; jwks_uri?: string; jwks?: { keys: JsonWebKey[] } };

export type Resolution = { ok: true; actor: Row } | { ok: false; reason: string };

/** Clock skew allowed on exp and nbf, in seconds. */
const SKEW = 60;

/** GOALIE_ISSUERS is a JSON list of issuers. Unset means no issuer, so every token is refused. */
export function configuredIssuers(): Issuer[] {
  const raw = process.env.GOALIE_ISSUERS?.trim();
  if (!raw) return [];
  const list = JSON.parse(raw) as Issuer[];
  if (!Array.isArray(list) || list.some((i) => !i.issuer || !i.audience)) {
    throw new Error("GOALIE_ISSUERS must be a JSON list of {issuer, audience}");
  }
  return list;
}

/** An issuer's keys may be refetched for an unknown key id at most this often, so a caller cannot make every request a fetch. */
const REFETCH_MS = 5 * 60_000;

/** A key fetch that takes longer than this fails, and the token is refused. */
const FETCH_TIMEOUT_MS = 5_000;

type CachedKeys = { keys: JsonWebKey[]; refetched?: number };
const keyCache = new Map<string, CachedKeys>();

/** Fetch an issuer's keys from `jwks_uri`, else from its discovery document. Undefined when the fetch fails. */
async function fetchKeys(issuer: Issuer): Promise<JsonWebKey[] | undefined> {
  try {
    let uri = issuer.jwks_uri;
    if (!uri) {
      const discovery = await fetch(`${issuer.issuer.replace(/\/$/, "")}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      uri = ((await discovery.json()) as { jwks_uri: string }).jwks_uri;
    }
    const keys = ((await (await fetch(uri, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })).json()) as { keys?: unknown }).keys;
    return Array.isArray(keys) ? (keys as JsonWebKey[]) : undefined;
  } catch {
    return undefined;
  }
}

/** Find the key a token names. Fetch the issuer's keys once, and once more per REFETCH_MS for a key id not seen. */
async function issuerKey(issuer: Issuer, kid: unknown): Promise<JsonWebKey | undefined | "unreachable"> {
  const byKid = (keys: JsonWebKey[]) => keys.find((k) => (k as { kid?: string }).kid === kid);
  if (issuer.jwks) return byKid(issuer.jwks.keys);
  let cached = keyCache.get(issuer.issuer);
  if (!cached) {
    const keys = await fetchKeys(issuer);
    if (!keys) return "unreachable";
    cached = { keys };
    keyCache.set(issuer.issuer, cached);
  }
  const found = byKid(cached.keys);
  if (found || (cached.refetched !== undefined && Date.now() - cached.refetched < REFETCH_MS)) return found;
  // The issuer may have rotated its keys. Fetch them once more.
  cached.refetched = Date.now();
  const keys = await fetchKeys(issuer);
  if (!keys) return "unreachable";
  cached.keys = keys;
  return byKid(keys);
}

function header(headers: Record<string, string>, name: string): string | undefined {
  const found = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  return found?.[1];
}

function decodePart(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf-8")) as Record<string, unknown>;
}

/** Verify an RS256 token against the issuer list. Return its claims, or why it was refused. */
export async function verifyToken(
  token: string,
  issuers: Issuer[],
): Promise<{ ok: true; claims: Record<string, unknown> } | { ok: false; reason: string }> {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "the token is not a JWT" };
  let head: Record<string, unknown>;
  let claims: Record<string, unknown>;
  try {
    head = decodePart(parts[0]);
    claims = decodePart(parts[1]);
  } catch {
    return { ok: false, reason: "the token is not a JWT" };
  }
  if (head.alg !== "RS256") return { ok: false, reason: "the token is not signed with RS256" };
  const issuer = issuers.find((i) => i.issuer === claims.iss);
  if (!issuer) return { ok: false, reason: "the token's issuer is not configured" };

  const jwk = await issuerKey(issuer, head.kid);
  if (jwk === "unreachable") return { ok: false, reason: "the issuer's keys could not be fetched" };
  if (!jwk) return { ok: false, reason: "the token's key is not the issuer's" };
  let key: KeyObject;
  try {
    key = createPublicKey({ key: jwk, format: "jwk" });
  } catch {
    return { ok: false, reason: "the issuer's key is not usable" };
  }
  const signed = Buffer.from(`${parts[0]}.${parts[1]}`);
  if (!verify("sha256", signed, key, Buffer.from(parts[2], "base64url"))) {
    return { ok: false, reason: "the token's signature does not verify" };
  }

  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(issuer.audience)) return { ok: false, reason: "the token is for another audience" };
  const now = Date.now() / 1000;
  if (typeof claims.exp !== "number" || claims.exp + SKEW < now) return { ok: false, reason: "the token has expired" };
  if (typeof claims.nbf === "number" && claims.nbf - SKEW > now) return { ok: false, reason: "the token is not valid yet" };
  return { ok: true, claims };
}

/** Resolve request headers to one actor. A human token maps by subject, an agent token by application id. */
export async function resolveActor(db: DatabaseSync, headers: Record<string, string>, issuers: Issuer[]): Promise<Resolution> {
  const bearer = header(headers, "authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const token = bearer ?? header(headers, "x-auth-request-access-token");
  if (!token) return { ok: false, reason: "no token" };
  const verified = await verifyToken(token, issuers);
  if (!verified.ok) return verified;
  const { claims } = verified;

  const email = header(headers, "x-auth-request-email");
  if (email !== undefined) {
    const names = [claims.email, claims.preferred_username, claims.upn].filter((v): v is string => typeof v === "string");
    if (!names.some((n) => n.toLowerCase() === email.toLowerCase())) {
      return { ok: false, reason: "the forwarded email does not match the token" };
    }
  }

  const agent = claims.idtyp === "app";
  const id = agent ? (claims.azp ?? claims.appid) : claims.sub;
  if (typeof id !== "string") return { ok: false, reason: "the token names no subject" };
  const actor = readActorByToken(db, agent ? "agent" : "human", id);
  if (!actor) return { ok: false, reason: `no ${agent ? "agent" : "human"} actor for this token` };
  return { ok: true, actor };
}
