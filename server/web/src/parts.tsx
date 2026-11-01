import { healthWord } from "./model/labels.ts";
import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { ActorRef, Health } from "../../src/api.ts";
import { placePopover, popoverWidth } from "./model/popover.ts";
import { useDismiss } from "./useScreen.ts";
import { encodeFocus } from "./model/feedback.ts";

/** The shared parts every view is built from. */

/** The brand the server writes into the page (review E4). One source: server/src/brand.ts. */
export const BRAND = JSON.parse(document.getElementById("goalie-brand")?.textContent ?? '{"app":"","mark":""}') as { app: string; mark: string };

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

/**
 * An actor's initial on a palette color. `mine` outlines the signed-in actor's own avatar.
 * The name is the tooltip under the pointer, and a tap shows it too (rule 12). A tap does not open or close the row.
 */
export function Avatar({ actor, mine = false }: { actor: ActorRef; mine?: boolean }) {
  const n = slot(actor.id);
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<CSSProperties>({});
  const box = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  useDismiss(open, [box, tip], useCallback(() => setOpen(false), []));
  return (
    <span
      ref={box}
      className={`av${mine ? " mine" : ""}`}
      data-focus={encodeFocus({ kind: "actor", id: actor.id, label: actor.name })}
      style={{ background: `var(--av-${n}-bg)`, color: `var(--av-${n}-ink)` }}
      title={actor.name}
      role="img"
      aria-label={actor.name}
      onClick={(e) => {
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        setAt({ left: Math.max(16, Math.min(r.left + r.width / 2, document.documentElement.clientWidth - 16)), top: r.bottom + 6 });
        setOpen((o) => !o);
      }}
    >
      {actor.name.slice(0, 1)}
      {open &&
        createPortal(
          <span ref={tip} className="tip name" role="note" style={at}>
            {actor.name}
          </span>,
          document.body,
        )}
    </span>
  );
}

/** Text a screen reader reads and the eye does not see. */
const Hidden = ({ children }: { children: ReactNode }) => <span className="vh">{children}</span>;

/**
 * The health as a mark of its color and its own shape, so color is not the only cue (rule 10): GREEN a circle, YELLOW a triangle, RED a square.
 * No health is a hollow circle. The word is there for a screen reader, and on a phone it shows beside the mark. `shown` writes it on every screen, as in the List's Health column.
 */
export function HealthDot({ health, word = true }: { health: Health; word?: boolean | "shown" | "beside" }) {
  return (
    <>
      <span className={`hdot ${health ?? "none"}`} style={{ background: health ? look(health).bar : "transparent" }} aria-hidden="true" />
      {/* "no health" is not a SPEC word (rule 13): a goal with no health shows the hollow circle, and the words are for a screen reader only. */}
      {/* "beside": the word is written next to the mark already, so the mark adds no hidden text (no "On track On track"). */}
      {word === "beside" ? null : word && health ? <span className={`hword ${health}${word === "shown" ? " shown" : ""}`}>{healthWord(health)}</span> : <Hidden>{health ? healthWord(health) : "no health"}</Hidden>}
    </>
  );
}

/** The Priority rank as a plain number. An empty slot keeps the columns aligned on rows with no rank. */
export const Rank = ({ rank }: { rank?: number }) => <span className="rnum">{rank ?? ""}</span>;

/**
 * A ? icon and its help card. A click or Enter opens it, a second click, Escape, or a click outside closes it. Pointing at it also shows it.
 * The card is placed in the screen by placePopover, so it never leaves the screen (rule 9).
 */
export function Help({ label, avoid, children }: { label: string; avoid?: React.RefObject<HTMLElement | null>; children: ReactNode }) {
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
      const anchor = button.current.getBoundingClientRect();
      setPlace(placePopover(anchor, card.current.offsetHeight, { width: document.documentElement.clientWidth, height: innerHeight }, avoid?.current?.getBoundingClientRect() ?? anchor));
    };
    measure();
    addEventListener("resize", measure);
    addEventListener("scroll", measure, true);
    return () => {
      removeEventListener("resize", measure);
      removeEventListener("scroll", measure, true);
    };
  }, [shown, avoid]);
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
          <div ref={card} className="tip" role="note" style={{ width: popoverWidth(document.documentElement.clientWidth), left: -9999, top: 0, ...place }}>
            {children}
          </div>,
          document.body,
        )}
    </span>
  );
}

/** A summary card. `help` is shown from the ? icon by the label, beside the card, so it covers none of the card's own controls (review X10). */
export function Card({ label, help, children }: { label: string; help?: ReactNode; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  return (
    <div className="card" ref={box}>
      <div className="lbl">
        {label}
        {help && (
          <Help label={label} avoid={box}>
            {help}
          </Help>
        )}
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

/** The legend's marks. The Timeline draws its swatches and the Calendar its chip marks; the words are the same. */
const LEGEND = {
  timeline: [
    ["sw health", "Health"],
    ["sw ahead", "Committed date"],
    ["sw pm", "Promotion Milestone"],
    ["sw Ambition", "Ambition date"],
    ["sw Fantasy", "Fantasy date"],
    ["sw slip", "Slip"],
  ],
  calendar: [
    ["mk Committed", "Committed date"],
    ["mk pm", "Promotion Milestone"],
    ["mk Ambition", "Ambition date"],
    ["mk Fantasy", "Fantasy date"],
    ["mk slip", "Slip"],
  ],
} as const;

/** The one legend. `help` adds a ? beside the item it names. */
export function Legend({ kind, help }: { kind: keyof typeof LEGEND; help?: Partial<Record<string, ReactNode>> }) {
  return (
    <div className={`legend ${kind}`}>
      {LEGEND[kind].map(([mark, label]) => (
        <span key={label} className="lg">
          <i className={mark} />
          {label}
          {help?.[label] && <Help label={label}>{help[label]}</Help>}
        </span>
      ))}
    </div>
  );
}
