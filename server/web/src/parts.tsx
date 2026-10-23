import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { ActorRef, GoalDate, Health } from "../../src/api.ts";
import { dateLabel } from "./model/dates.ts";
import { placePopover } from "./model/popover.ts";
import { useDismiss } from "./useScreen.ts";

/** The shared parts every view is built from. */

export const BRAND = { app: "Goalie", mark: "G" } as const;

const HEALTH: Record<string, { bg: string; ink: string; bar: string }> = {
  GREEN: { bg: "var(--green-bg)", ink: "var(--green-ink)", bar: "var(--green)" },
  YELLOW: { bg: "var(--yellow-bg)", ink: "var(--yellow-ink)", bar: "var(--yellow)" },
  RED: { bg: "var(--red-bg)", ink: "var(--red-ink)", bar: "var(--red)" },
  none: { bg: "var(--none-bg)", ink: "var(--mute)", bar: "var(--none)" },
};

/** The token colors for a health. No health is grey. */
export const look = (health: Health) => HEALTH[health ?? "none"];

/** Avatar colors. One is picked by a hash of the actor id. */
const AVATAR_COLORS = 6;

function slot(id: string): number {
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return hash % AVATAR_COLORS;
}

/** An actor's initial on a palette color. `mine` outlines the signed-in actor's own avatar. The name is the tooltip. */
export function Avatar({ actor, mine = false }: { actor: ActorRef; mine?: boolean }) {
  const n = slot(actor.id);
  return (
    <span className={`av${mine ? " mine" : ""}`} style={{ background: `var(--av-${n}-bg)`, color: `var(--av-${n}-ink)` }} title={actor.name}>
      {actor.name.slice(0, 1)}
    </span>
  );
}

/** Text a screen reader reads and the eye does not see. */
export const Hidden = ({ children }: { children: ReactNode }) => <span className="vh">{children}</span>;

/** The health as a dot of its color. The word is there for a screen reader. No health is a hollow dot. */
export function HealthDot({ health }: { health: Health }) {
  return (
    <>
      <span className={`hdot${health ? "" : " none"}`} style={{ background: health ? look(health).bar : "transparent" }} />
      <Hidden>{health ?? "no health"}</Hidden>
    </>
  );
}

/** The Priority rank as a plain number. An empty slot keeps the columns aligned on rows with no rank. */
export const Rank = ({ rank }: { rank?: number }) => <span className="rnum">{rank ?? ""}</span>;

/** A goal date with its Date Type, and its slip. It does not wrap inside. */
export function DateMark({ date, today }: { date: GoalDate; today: string }) {
  return (
    <span className="date">
      {dateLabel(date, today)}
      {date.slipDays !== undefined && <span className="late"> slip {date.slipDays} days</span>}
    </span>
  );
}

/**
 * A ? icon and its help card. A click or Enter opens it, a second click, Escape, or a click outside closes it. Pointing at it also shows it.
 * The card is placed in the screen by placePopover, so it never leaves the screen (rule 9).
 */
export function Help({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<CSSProperties>({});
  const shown = open || hover;
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, [button, card], close);
  useLayoutEffect(() => {
    if (!shown) return;
    const measure = () => {
      if (!button.current || !card.current) return;
      setPlace(placePopover(button.current.getBoundingClientRect(), card.current.offsetHeight, { width: document.documentElement.clientWidth, height: innerHeight }));
    };
    measure();
    addEventListener("resize", measure);
    addEventListener("scroll", measure, true);
    return () => {
      removeEventListener("resize", measure);
      removeEventListener("scroll", measure, true);
    };
  }, [shown]);
  return (
    <span className="help">
      <button
        ref={button}
        type="button"
        className={`q${shown ? " on" : ""}`}
        aria-label={`What ${label} means`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onPointerEnter={(e) => e.pointerType === "mouse" && setHover(true)}
        onPointerLeave={() => setHover(false)}
      >
        ?
      </button>
      {shown &&
        createPortal(
          <div ref={card} className="tip" role="note" style={{ width: Math.min(300, document.documentElement.clientWidth - 32), left: -9999, top: 0, ...place }}>
            {children}
          </div>,
          document.body,
        )}
    </span>
  );
}

/** A summary card. `help` is shown from the ? icon by the label. */
export function Card({ label, help, children }: { label: string; help?: ReactNode; children: ReactNode }) {
  return (
    <div className="card">
      <div className="lbl">
        {label}
        {help && <Help label={label}>{help}</Help>}
      </div>
      {children}
    </div>
  );
}

export const CHEVRON = (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 4.5 6 7.5 9 4.5" />
  </svg>
);
