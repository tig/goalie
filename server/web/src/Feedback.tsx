import { useRef, useState } from "react";
import { postFeedback } from "./data.ts";
import { NOTE_MAX, type FeedbackAnswer } from "./model/feedback.ts";

/**
 * The feedback control in the top bar (tig/goalie#56). It opens a dialog with one note. Send posts the note and this page's URL.
 * The dialog says that the note was sent, or why it was not. A note that was not sent stays in the box.
 */
export function Feedback() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [answer, setAnswer] = useState<FeedbackAnswer | undefined>();
  const send = async () => {
    setSending(true);
    setAnswer(undefined);
    const result = await postFeedback(note);
    setSending(false);
    setAnswer(result);
    if (result.sent) setNote("");
  };
  return (
    <>
      <button
        type="button"
        className="btn topfeedback"
        onClick={() => {
          setAnswer(undefined);
          dialog.current?.showModal();
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 2.5h10v7H6.5L3.5 12V9.5H2z" />
        </svg>
        <span className="topfeedbackword">Feedback</span>
      </button>
      <dialog ref={dialog} className="feedback card" aria-labelledby="feedback-title">
        <form
          method="dialog"
          onSubmit={(e) => {
            e.preventDefault();
            if (!sending && note.trim()) void send();
          }}
        >
          <h2 id="feedback-title">Send feedback</h2>
          <label htmlFor="feedback-note" className="small">
            What should change? This page's address goes with your note.
          </label>
          <textarea id="feedback-note" value={note} maxLength={NOTE_MAX} rows={5} onChange={(e) => setNote(e.target.value)} />
          <p className={`small${answer && !answer.sent ? " refused" : ""}`} role="status">
            {sending ? "Sending." : (answer?.message ?? "")}
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
