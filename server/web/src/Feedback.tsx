import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { postFeedback } from "./data.ts";
import { createFeedbackMark, decodeFocus, FEEDBACK_CHROME, feedbackFocus, focusChain, isFeedbackChrome, isTyping, menuPoint, NOTE_MAX, type FeedbackAnswer, type FeedbackFocus, type FocusItem } from "./model/feedback.ts";
import { parseRoute, type Route } from "./model/route.ts";
import { useDismiss } from "./useScreen.ts";

/** The first name in a focus breadcrumb: the page the element is on. */
const PAGE_NAME: Record<Route["page"], string> = { home: "Home", work: "Work items", mine: "My goals", new: "New goal", goal: "Goal page", github: "GitHub" };

/** What a control pick is: a button, a link, or a tab. A goal row's [role=link] names its goal in data-focus instead. */
const CONTROL = "button, a[href], [role=button], [role=tab]";

/** A control's name: its aria-label, else its text, in one line. */
const controlLabel = (el: Element) => (el.getAttribute("aria-label") ?? el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80);

/** The element under a right-click, and every element around it, that names an item in data-focus, outermost first. Inside an edit form, the form is the pick. */
function pickedChain(target: Element): { items: FocusItem[]; picked: Element | null } {
  const found: (FocusItem & { el: Element })[] = [];
  for (let el = target.closest("[data-focus]"); el; el = el.parentElement?.closest("[data-focus]") ?? null) {
    const item = decodeFocus(el.getAttribute("data-focus"));
    if (item) found.unshift({ ...item, el });
  }
  // tig/goalie#68: a button, link, or tab under the pointer is the smallest pick, inside the item around it. One that names an item is that item.
  const control = target.closest(CONTROL);
  const label = control && controlLabel(control);
  if (control && label && !control.hasAttribute("data-focus") && label !== found.at(-1)?.label && (!found.length || found.at(-1)!.el.contains(control))) found.push({ kind: "control", id: label, label, el: control });
  const chain = focusChain(found);
  return { items: chain.map(({ kind, id, label }) => ({ kind, id, label })), picked: chain.at(-1)?.el ?? null };
}

type Menu = { x: number; y: number; focus?: FeedbackFocus; back: Element | null };

/** A long press (#58): one finger held this long, moving no more than LONG_PRESS_SLOP px. The Android and iOS system long press is about 500 ms. */
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP = 10;

/**
 * Feedback (tig/goalie#56). The top-bar button opens the dialog with no picked element. A right-click anywhere else in GOALIE opens GOALIE's menu in place of the browser's,
 * and its "Feedback..." opens the dialog about the element that was right-clicked. The ContextMenu key and Shift+F10 open the menu on the focused element.
 * On a phone, a long press opens the same menu on the pressed element (#58).
 * A text field keeps the browser's menu, as in the Canon Viewer.
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
  // Where keyboard focus goes when the dialog closes: the element the menu opened on. The menu item that had focus is gone by then.
  const returnTo = useRef<HTMLElement | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [answer, setAnswer] = useState<FeedbackAnswer | undefined>();

  useEffect(() => {
    const open = (target: Element, point: { clientX: number; clientY: number }) => {
      const { items, picked } = pickedChain(target);
      mark.set(picked);
      setMenu({ ...menuPoint(point, (picked ?? target).getBoundingClientRect()), focus: feedbackFocus(PAGE_NAME[parseRoute(location.pathname).page], items), back: document.activeElement });
    };
    const mine = (target: EventTarget | null): target is Element => target instanceof Element && !isFeedbackChrome(target) && !isTyping(target);
    const feedbackMenu = `${FEEDBACK_CHROME}[role=menu]`;
    const onMenu = (e: MouseEvent) => {
      // A held finger's own contextmenu (Android): this event opens the menu, and the press timer must not open a second one.
      if (press) {
        clearTimeout(press.timer);
        press.opened = true;
      }
      // A contextmenu while the feedback menu is open must not open the browser's menu over it. The owner menu is not that menu.
      if (document.querySelector(feedbackMenu) || (e.target instanceof Element && e.target.closest(feedbackMenu))) {
        e.preventDefault();
        return;
      }
      if (e.defaultPrevented || !mine(e.target)) return;
      e.preventDefault();
      open(e.target, e);
    };
    // Shift+F10 opens the menu on the focused element. Chrome sends no contextmenu for it in headless Chrome (measured), so GOALIE reads the key itself.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F10" || !e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.defaultPrevented) return;
      const target = document.activeElement && document.activeElement !== document.body ? document.activeElement : document.querySelector("main");
      if (!mine(target)) return;
      e.preventDefault();
      open(target, { clientX: 0, clientY: 0 });
    };
    // #58: a long press on a phone opens the menu too. iOS Safari sends no contextmenu for it, so GOALIE times the press: one finger held LONG_PRESS_MS without moving.
    // Android Chrome may also send a contextmenu: whichever comes first opens the menu, and onMenu prevents the other while it is open.
    let press: { timer: number; x: number; y: number; opened: boolean } | null = null;
    const cancel = () => {
      if (!press || press.opened) return;
      clearTimeout(press.timer);
      press = null;
    };
    const onTouchStart = (e: TouchEvent) => {
      cancel();
      press = null;
      if (e.touches.length !== 1 || !mine(e.target)) return;
      const target = e.target;
      const { clientX: x, clientY: y } = e.touches[0];
      const held = { x, y, opened: false, timer: 0 };
      held.timer = window.setTimeout(() => {
        held.opened = true;
        if (!document.querySelector(feedbackMenu)) open(target, { clientX: x, clientY: y });
      }, LONG_PRESS_MS);
      press = held;
    };
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (press && !press.opened && (!t || Math.hypot(t.clientX - press.x, t.clientY - press.y) > LONG_PRESS_SLOP)) cancel();
    };
    // The finger that opened the menu lifts: no click on the row under it, so the page stays.
    const onTouchEnd = (e: TouchEvent) => {
      if (press?.opened) e.preventDefault();
      cancel();
      press = null;
    };
    document.addEventListener("contextmenu", onMenu, true);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    document.addEventListener("touchmove", onTouchMove, { capture: true, passive: true });
    document.addEventListener("touchend", onTouchEnd, { capture: true, passive: false });
    document.addEventListener("touchcancel", onTouchEnd, true);
    window.addEventListener("scroll", cancel, true);
    return () => {
      cancel();
      document.removeEventListener("contextmenu", onMenu, true);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("touchstart", onTouchStart, true);
      document.removeEventListener("touchmove", onTouchMove, true);
      document.removeEventListener("touchend", onTouchEnd, true);
      document.removeEventListener("touchcancel", onTouchEnd, true);
      window.removeEventListener("scroll", cancel, true);
    };
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

  const openDialog = (about?: FeedbackFocus, back?: Element | null) => {
    returnTo.current = back instanceof HTMLElement && back !== document.body ? back : null;
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
            <button ref={item} type="button" role="menuitem" onClick={() => openDialog(menu.focus, menu.back)}>
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
          const back = returnTo.current;
          returnTo.current = null;
          if (back?.isConnected) back.focus();
          // Github... is gone with the owner menu. The avatar is still there.
          else if (back?.closest(".usermenu")) document.querySelector<HTMLElement>(".me button.av")?.focus();
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
