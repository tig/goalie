import { BRAND } from "../../../src/brand.ts";

/**
 * In-app feedback (tig/goalie#56). The note and the page URL go to same-origin POST /api/feedback.
 * GOALIE has no such route: host configuration sends the path to xw-feedback, which files the note as an issue.
 * The body is the Canon Viewer's shape. xw-feedback picks the repo and the labels, and the host adds the reporter's email, so the body names none of them.
 */

export const FEEDBACK_PATH = "/api/feedback";

/** The longest note. xw-feedback clips a landing note to 4000 characters, so the app keeps GOALIE notes to the same size. */
export const NOTE_MAX = 4000;

export type FeedbackBody = {
  note: string;
  page: { url: string; app: "goalie" };
  focus: { id: "chrome"; label: string; kind: "chrome"; breadcrumb: string[] };
};

/** The body for one note from the page at url. */
export function feedbackBody(note: string, url: string): FeedbackBody {
  return { note: note.trim().slice(0, NOTE_MAX), page: { url, app: "goalie" }, focus: { id: "chrome", label: BRAND.app, kind: "chrome", breadcrumb: [] } };
}

/** What came back. `type` is the Fetch response type: "opaqueredirect" for a redirect the app did not follow, "error" for no answer. */
export type FeedbackReply = { status: number; type: string; contentType: string; text: string };

export type FeedbackAnswer = { sent: boolean; message: string };

const NOT_AVAILABLE = "Feedback is not available. Your note was not sent.";
const SIGN_IN = "Sign in again, then send your note.";

const REFUSED: Record<number, string> = {
  400: "Write a note, then send it.",
  401: SIGN_IN,
  403: "The feedback service refused this page. Your note was not sent.",
  404: NOT_AVAILABLE,
  429: "Too many notes in one minute. Wait a minute, then send it again.",
  502: NOT_AVAILABLE,
};

/** Sent only on a 2xx JSON answer with ok true. A 404 or 502 means the host does not send /api/feedback to xw-feedback yet. */
export function feedbackAnswer(reply: FeedbackReply): FeedbackAnswer {
  if (reply.type === "opaqueredirect") return { sent: false, message: SIGN_IN };
  if (reply.status === 0) return { sent: false, message: "GOALIE could not reach the server. Your note was not sent." };
  if (reply.status >= 200 && reply.status < 300) {
    let ok = false;
    try {
      ok = reply.contentType.includes("json") && (JSON.parse(reply.text) as { ok?: unknown }).ok === true;
    } catch {
      ok = false;
    }
    return ok ? { sent: true, message: "Sent. Thank you." } : { sent: false, message: NOT_AVAILABLE };
  }
  return { sent: false, message: REFUSED[reply.status] ?? `Your note was not sent (status ${reply.status}).` };
}
