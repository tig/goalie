/**
 * In-app feedback (tig/goalie#56). The note and the page URL go to same-origin POST /api/feedback.
 * GOALIE has no such route: host configuration sends the path to xw-feedback, which files the note as an issue.
 * The body is the note and the page, a subset of the Canon Viewer's body. It has no focus: xw-feedback titles a GOALIE note from the note (excaliwire/factory#3192).
 * xw-feedback picks the repo and the labels, and the host is to add the reporter's email (#56, item 2), so the body names none of them.
 */

export const FEEDBACK_PATH = "/api/feedback";

/** The longest note. xw-feedback clips a landing note to 4000 characters, so the app keeps GOALIE notes to the same size. */
export const NOTE_MAX = 4000;

export type FeedbackBody = {
  note: string;
  page: { url: string; app: "goalie" };
};

/** The body for one note from the page at url. */
export function feedbackBody(note: string, url: string): FeedbackBody {
  return { note: note.trim().slice(0, NOTE_MAX), page: { url, app: "goalie" } };
}

/** What came back. `type` is the Fetch response type: "opaqueredirect" for a redirect the app did not follow, "error" for no answer. */
export type FeedbackReply = { status: number; type: string; contentType: string; text: string };

export type FeedbackAnswer = { sent: boolean; message: string };

const NOT_AVAILABLE = "Feedback is not available. Your note was not sent.";
const SIGN_IN = "Sign in again, then send your note.";

const REFUSED: Record<number, string> = {
  400: "Write a note, then send it.",
  // xw-feedback answers 401 only when it refuses the caller key the host adds (excaliwire/factory#3192). With the host sign-in in front, a signed-out person gets a redirect instead.
  401: NOT_AVAILABLE,
  403: "The feedback service refused this page. Your note was not sent.",
  404: NOT_AVAILABLE,
  429: "Too many notes in one minute. Wait a minute, then send it again.",
  502: NOT_AVAILABLE,
};

/**
 * Sent only on a 2xx JSON answer with ok true.
 * A 401 or 404 is a host fault: xw-feedback refused the key the host adds, or the host does not send the path to xw-feedback, so GOALIE answers it.
 * A 502 from xw-feedback means it took the key and could not file the note: its token is not xw-admin, or GitHub failed. A 502 from the host means xw-feedback did not answer.
 * In each case the note was not sent and the person cannot fix it, so each says that feedback is not available.
 */
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
