import { useCallback, useEffect, useState } from "react";
import type { ApiError, CommandsRequest, CommandsResponse } from "../../src/api.ts";
import { commandsAnswer } from "./model/commands.ts";
import { FEEDBACK_PATH, feedbackAnswer, feedbackBody, type FeedbackAnswer, type FeedbackFocus } from "./model/feedback.ts";

/** Reading the API. Every read is one GET with the actor's session; the server holds the rules. */

type Loaded<T> = { state: "loading" } | { state: "ok"; data: T } | { state: "refused"; status: number; reason: string };

/** GET one resource; a refusal or a reply that is not JSON reads as refused, with its reason. */
export async function getJson<T>(url: string): Promise<Loaded<T>> {
  try {
    const reply = await fetch(url, { headers: { accept: "application/json" } });
    if (reply.ok) return { state: "ok", data: (await reply.json()) as T };
    const error = (await reply.json().catch(() => ({ reason: reply.statusText }))) as Partial<ApiError>;
    return { state: "refused", status: reply.status, reason: error.reason ?? reply.statusText };
  } catch (e) {
    return { state: "refused", status: 0, reason: (e as Error).message };
  }
}

/** One resource, loaded when the URL changes. `reload` reads it again, as after every save. */
export function useJson<T>(url: string): [Loaded<T>, () => void] {
  const [loaded, setLoaded] = useState<Loaded<T>>({ state: "loading" });
  const [round, setRound] = useState(0);
  const [seen, setSeen] = useState(url);
  if (seen !== url) {
    setSeen(url);
    setLoaded({ state: "loading" });
  }
  useEffect(() => {
    let live = true;
    getJson<T>(url).then((result) => live && setLoaded(result));
    return () => {
      live = false;
    };
  }, [url, round]);
  const reload = useCallback(() => setRound((n) => n + 1), []);
  return [loaded, reload];
}

/** POST /api/commands: one batch, every command stored or none. The answer carries its HTTP status. */
export async function postCommands(batch: CommandsRequest): Promise<{ status: number; body: CommandsResponse }> {
  try {
    const reply = await fetch("/api/commands", { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(batch) });
    // A reply that is not JSON (a proxy's error page) reads as a refusal in plain words, not a parse error (QA N7).
    const body = await reply.json().catch(() => ({ error: "bad_command", reason: `The server could not take the save (${reply.status}). Try again.` }));
    return { status: reply.status, body: commandsAnswer(body) };
  } catch {
    return { status: 0, body: { ok: false, at: 0, error: "bad_command", message: "GOALIE could not reach the server. Try again." } };
  }
}

/**
 * POST /api/feedback: one note, this page's URL, and the picked element's focus when there is one. A redirect is not followed, and the answer for one is "sign in again".
 * The URL has no query and no hash: tig/goalie is public, and the query can hold search text.
 */
export async function postFeedback(note: string, focus?: FeedbackFocus): Promise<FeedbackAnswer> {
  try {
    const reply = await fetch(FEEDBACK_PATH, { method: "POST", redirect: "manual", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(feedbackBody(note, location.origin + location.pathname, focus)) });
    return feedbackAnswer({ status: reply.status, type: reply.type, contentType: reply.headers.get("content-type") ?? "", text: await reply.text().catch(() => "") });
  } catch {
    return feedbackAnswer({ status: 0, type: "error", contentType: "", text: "" });
  }
}
