/**
 * In-app feedback (tig/goalie#56). The note, the page URL, and the picked element go to same-origin POST /api/feedback.
 * GOALIE has no such route: host configuration sends the path to xw-feedback, which files the note as an issue.
 * The body is the note, the page, and the focus, a subset of the Canon Viewer's body. With no picked element it has no focus, and xw-feedback leaves out the Focus section (excaliwire/factory#3192).
 * xw-feedback picks the repo and the labels, and the host is to add the reporter's email (#56, item 2), so the body names none of them.
 * The words are Tig's (docs/specs/SPEC.md section 4, Feedback).
 */

export const FEEDBACK_PATH = "/api/feedback";

/** The longest note. xw-feedback clips a landing note to 4000 characters, so the app keeps GOALIE notes to the same size. */
export const NOTE_MAX = 4000;

/** What a note is about: the Canon Viewer's FeedbackFocus (excaliwire/factory presentation-core src/feedback/types.ts). */
export type FeedbackFocus = { label: string; id: string; kind: string; breadcrumb: string[] };

/** One element a right-click can pick. Its data-focus attribute is this, as JSON. */
export type FocusItem = { kind: string; id: string; label: string };

export type FeedbackBody = {
  note: string;
  page: { url: string; app: "goalie" };
  focus?: FeedbackFocus;
};

/** The body for one note from the page at url, about focus when an element was picked. */
export function feedbackBody(note: string, url: string, focus?: FeedbackFocus): FeedbackBody {
  return { note: note.trim().slice(0, NOTE_MAX), page: { url, app: "goalie" }, ...(focus ? { focus } : {}) };
}

/*
 * Picking an element. Ported from excaliwire/factory presentation-core src/feedback/hit.ts and describe.ts at 7d1a70cf596ec1ec7ada03668df302b9520bcb50,
 * with their tests in server/tests/test_web_feedback.py. The Canon Viewer resolves data-focus against circuit.yaml. GOALIE writes the item itself into data-focus,
 * so the focus is only what the element shows: never typed text or a field's value.
 */

/** The feedback control and its dialog. A right-click there keeps the browser's menu. */
export const FEEDBACK_CHROME = "[data-feedback-ui]";
/** The attribute the picked element keeps while the menu or the dialog is open. */
export const FEEDBACK_MARK = "data-feedback-focused";

export function isFeedbackChrome(target: EventTarget | null): boolean {
  if (typeof Element === "undefined" || !(target instanceof Element)) return false;
  return Boolean(target.closest(FEEDBACK_CHROME));
}

/** Inputs that take no typed text. Ported from presentation-core src/viewport/viewChrome.ts NO_TEXT_INPUT (lines 5 to 14) at 7d1a70cf5. */
const NO_TEXT_INPUT = new Set(["checkbox", "radio", "button", "submit", "reset", "color", "file", "image"]);

/**
 * True for a text field: an input that takes text, a select, a textarea, or contenteditable. Ported from viewChrome.ts isTyping (lines 100 to 109) at 7d1a70cf5.
 * A right-click there keeps the browser's menu, so paste and spelling work. In the Canon Viewer the menu opens only on a picked element, and its text fields are not ones.
 */
export function isTyping(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined") return false;
  if (target instanceof HTMLInputElement) return !NO_TEXT_INPUT.has(target.type);
  return target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
}

/** data-focus is JSON of the item. Do not invent a second encoding. */
export function encodeFocus(item: FocusItem): string {
  return JSON.stringify(item);
}

export function decodeFocus(raw: string | null | undefined): FocusItem | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Record<keyof FocusItem, unknown>> | null;
    if (value && typeof value.kind === "string" && typeof value.id === "string" && typeof value.label === "string") return { kind: value.kind, id: value.id, label: value.label };
  } catch {
    return null;
  }
  return null;
}

/** The focus of a pick: the innermost item, and the page's name and the items around it as the breadcrumb. No item is no focus. */
export function feedbackFocus(page: string, chain: FocusItem[]): FeedbackFocus | undefined {
  const item = chain.at(-1);
  return item && { label: item.label, id: item.id, kind: item.kind, breadcrumb: [page, ...chain.slice(0, -1).map((c) => c.label)] };
}

/** Where the menu opens. A contextmenu from the keyboard has no pointer position, so the menu opens at the middle of the element. */
export function menuPoint(event: { clientX: number; clientY: number }, rect: { left: number; top: number; width: number; height: number }): { x: number; y: number } {
  return { x: event.clientX || rect.left + rect.width / 2, y: event.clientY || rect.top + rect.height / 2 };
}

/** The picked element keeps a mark while the menu or the dialog is open. Caller holds `previous`. */
export function markFeedbackFocus(el: Element | null, previous: Element | null = null): Element | null {
  if (previous && previous !== el) previous.removeAttribute(FEEDBACK_MARK);
  if (!el) {
    previous?.removeAttribute(FEEDBACK_MARK);
    return null;
  }
  el.setAttribute(FEEDBACK_MARK, "");
  return el;
}

/** One holder for the mark. Call set(null) when the menu and the dialog are both closed. */
export function createFeedbackMark() {
  let current: Element | null = null;
  return {
    set(el: Element | null): Element | null {
      current = markFeedbackFocus(el, current);
      return current;
    },
  };
}

/** What came back. `type` is the Fetch response type: "opaqueredirect" for a redirect the app did not follow, "error" for no answer. */
export type FeedbackReply = { status: number; type: string; contentType: string; text: string };

export type FeedbackAnswer = { sent: boolean; message: string; issue?: { number: number; url: string } };

const NOT_AVAILABLE = "Feedback is not available. Your issue was not sent.";
const SIGN_IN = "Sign in again, then send your issue.";

const REFUSED: Record<number, string> = {
  400: "Describe the issue, then send it.",
  // xw-feedback answers 401 only when it refuses the caller key the host adds (excaliwire/factory#3192).
  401: NOT_AVAILABLE,
  403: "The feedback service refused this page. Your issue was not sent.",
  404: NOT_AVAILABLE,
  429: "Too many issues in one minute. Wait a minute, then send it again.",
  502: NOT_AVAILABLE,
};

/** The issue a 201 names, read as the Canon Viewer reads it: issueUrl, url, or html_url, and number or issueNumber. Only an https link counts. */
function filedIssue(answer: Record<string, unknown>): { number: number; url: string } | undefined {
  const url = [answer.issueUrl, answer.url, answer.html_url].find((u): u is string => typeof u === "string" && u.startsWith("https://"));
  const number = [answer.number, answer.issueNumber].find((n): n is number => Number.isSafeInteger(n) && (n as number) > 0);
  return url && number ? { number, url } : undefined;
}

/**
 * Sent only on a 2xx JSON answer with ok true.
 * A 401 or 404 is a host fault: xw-feedback refused the key the host adds, or the host does not send the path to xw-feedback, so GOALIE answers it.
 * A 502 from xw-feedback means it took the key and could not file the note: its token is not xw-admin, or GitHub failed. A 502 from the host means the sign-in gate or xw-feedback did not answer: the host checks sign-in before it sends the path on (operations#179).
 * In each case the note was not sent, so each says that feedback is not available.
 */
export function feedbackAnswer(reply: FeedbackReply): FeedbackAnswer {
  if (reply.type === "opaqueredirect") return { sent: false, message: SIGN_IN };
  if (reply.status === 0) return { sent: false, message: "GOALIE could not reach the server. Your issue was not sent." };
  if (reply.status >= 200 && reply.status < 300) {
    let answer: Record<string, unknown> | undefined;
    try {
      const parsed: unknown = reply.contentType.includes("json") ? JSON.parse(reply.text) : undefined;
      answer = parsed && typeof parsed === "object" && (parsed as { ok?: unknown }).ok === true ? (parsed as Record<string, unknown>) : undefined;
    } catch {
      answer = undefined;
    }
    if (!answer) return { sent: false, message: NOT_AVAILABLE };
    const issue = filedIssue(answer);
    return issue ? { sent: true, message: `Filed as issue #${issue.number}`, issue } : { sent: true, message: "Filed." };
  }
  return { sent: false, message: REFUSED[reply.status] ?? `Your issue was not sent (status ${reply.status}).` };
}
