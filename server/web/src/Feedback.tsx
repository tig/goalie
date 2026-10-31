import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { postFeedback } from "./data.ts";
import { createFeedbackMark, decodeFocus, feedbackFocus, isFeedbackChrome, menuPoint, NOTE_MAX, type FeedbackAnswer, type FeedbackFocus, type FocusItem } from "./model/feedback.ts";
import { parseRoute, type Route } from "./model/route.ts";
import { useDismiss } from "./useScreen.ts";

/** The first name in a focus breadcrumb: the page the element is on. */
const PAGE_NAME: Record<Route["page"], string> = { home: "Home", work: "Work items", new: "New goal", goal: "Goal page" };

/** The element under a right-click, and every element around it, that names an item in data-focus. Outermost first. */
function pickedChain(target: Element): { items: FocusItem[]; picked: Element | null } {
  const items: FocusItem[] = [];
  let picked: Element | null = null;
  for (let el = target.closest("[data-focus]"); el; el = el.parentElement?.closest("[data-focus]") ?? null) {
    const item = decodeFocus(el.getAttribute("data-focus"));
    if (!item) continue;
    items.unshift(item);
    picked ??= el;
  }
  return { items, picked };
}

type Menu = { x: number; y: number; focus?: FeedbackFocus; back: Element | null };

/**
 * Feedback (tig/goalie#56). The top-bar button opens the dialog with no picked element. A right-click anywhere else in GOALIE opens GOALIE's menu in place of the browser's,
 * and its "Feedback..." opens the dialog about the element that was right-clicked. The ContextMenu key and Shift+F10 open the menu on the focused element.
 * The dialog shows what was picked, says that the note was sent or why not, and keeps a note that was not sent. The Canon Viewer's pattern, ported in model/feedback.ts.
 */
export function Feedback() {
  const dialog = useRef<HTMLDialogElement>(null);
  const menuBox = useRef<HTMLDivElement>(null);
  const item = useRef<HTMLButtonElement>(null);
  const [mark] = useState(createFeedbackMark);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [place, setPlace] = useState<CSSProperties>({});
  const [focus, setFocus] = useState<FeedbackFocus | undefined>();
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [answer, setAnswer] = useState<FeedbackAnswer | undefined>();

  useEffect(() => {
    const onMenu = (e: MouseEvent) => {
      if (e.defaultPrevented || isFeedbackChrome(e.target) || !(e.target instanceof Element)) return;
      e.preventDefault();
      const { items, picked } = pickedChain(e.target);
      mark.set(picked);
      setMenu({ ...menuPoint(e, (picked ?? e.target).getBoundingClientRect()), focus: feedbackFocus(PAGE_NAME[parseRoute(location.pathname).page], items), back: document.activeElement });
    };
    document.addEventListener("contextmenu", onMenu, true);
    return () => document.removeEventListener("contextmenu", onMenu, true);
  }, [mark]);

  // The menu opens at the point and stays 8 px inside the screen. Its one item takes keyboard focus.
  useLayoutEffect(() => {
    if (!menu || !menuBox.current) return;
    const { offsetWidth: w, offsetHeight: h } = menuBox.current;
    setPlace({ left: Math.max(8, Math.min(menu.x, innerWidth - w - 8)), top: Math.max(8, Math.min(menu.y, innerHeight - h - 8)) });
    item.current?.focus();
  }, [menu]);

  const closeMenu = useCallback(() => {
    if (menu?.back instanceof HTMLElement) menu.back.focus();
    setMenu(null);
    if (!dialog.current?.open) mark.set(null);
  }, [menu, mark]);
  useDismiss(Boolean(menu), [menuBox], closeMenu);

  const openDialog = (about?: FeedbackFocus) => {
    setMenu(null);
    setFocus(about);
    setAnswer(undefined);
    dialog.current?.showModal();
  };
  const send = async () => {
    setSending(true);
    setAnswer(undefined);
    const result = await postFeedback(note, focus);
    setSending(false);
    setAnswer(result);
    if (result.sent) setNote("");
  };
  return (
    <>
      <button
        type="button"
        className="btn topfeedback"
        data-feedback-ui
        onClick={() => {
          mark.set(null);
          openDialog();
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 2.5h10v7H6.5L3.5 12V9.5H2z" />
        </svg>
        <span className="topfeedbackword">Feedback</span>
      </button>
      {menu &&
        createPortal(
          <div
            ref={menuBox}
            className="ctxmenu"
            role="menu"
            aria-label="GOALIE"
            data-feedback-ui
            style={{ left: menu.x, top: menu.y, ...place }}
            onKeyDown={(e) => {
              if (e.key === "Tab") closeMenu();
              if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Home" || e.key === "End") {
                e.preventDefault();
                item.current?.focus();
              }
            }}
          >
            <button ref={item} type="button" role="menuitem" onClick={() => openDialog(menu.focus)}>
              Feedback...
            </button>
          </div>,
          document.body,
        )}
      <dialog
        ref={dialog}
        className="feedback card"
        aria-labelledby="feedback-title"
        data-feedback-ui
        onClose={() => {
          mark.set(null);
          setFocus(undefined);
        }}
      >
        <form
          method="dialog"
          onSubmit={(e) => {
            e.preventDefault();
            if (!sending && note.trim()) void send();
          }}
        >
          <h2 id="feedback-title">Send feedback</h2>
          {focus && (
            <div className="feedbackfocus">
              <p className="feedbackabout">
                About: {focus.label} ({focus.kind})
              </p>
              <p className="small">{[focus.id !== focus.label ? focus.id : "", focus.breadcrumb.join(" / ")].filter(Boolean).join(" · ")}</p>
            </div>
          )}
          <label htmlFor="feedback-note" className="small">
            What is the issue? The page's address and details of where your cursor is go with your note.
          </label>
          <textarea id="feedback-note" value={note} maxLength={NOTE_MAX} rows={5} onChange={(e) => setNote(e.target.value)} />
          <p className={`small${answer && !answer.sent ? " refused" : ""}`} role="status">
            {sending ? (
              "Sending."
            ) : answer?.issue ? (
              <>
                Filed as issue{" "}
                <a href={answer.issue.url} target="_blank" rel="noreferrer">
                  #{answer.issue.number}
                </a>
              </>
            ) : (
              (answer?.message ?? "")
            )}
          </p>
          <div className="feedbackrow">
            <button type="submit" className="btn primary" disabled={sending || !note.trim()}>
              Send
            </button>
            <button type="button" className="btn" onClick={() => dialog.current?.close()}>
              Close
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
