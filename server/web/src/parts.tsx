import { healthWord } from "./model/labels.ts";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { ActorRef, GitHubRefResponse, Health } from "../../src/api.ts";
import { placePopover, popoverWidth } from "./model/popover.ts";
import { useDismiss } from "./useScreen.ts";
import { encodeFocus } from "./model/feedback.ts";
import { canonicalRefUrl, githubIssues, markdown, refLabel, refTitle, titleParts, type Block, type Inline, type RefFound } from "./model/markdown.ts";
import { getJson } from "./data.ts";

/** The shared parts every view is built from. */

/** A GitHub issue or pull request href whose repository is associated, when that list is passed. With no list, every such href. An http address is the same issue as https. */
function inScope(href: string, repos: string[] | undefined): boolean {
  const url = canonicalRefUrl(href);
  if (url === null) return false;
  if (repos === undefined) return true;
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\//.exec(url);
  if (match === null || match[1] === undefined || match[2] === undefined) return false;
  const want = `${match[1]}/${match[2]}`.toLowerCase();
  return repos.some((repo) => repo.toLowerCase() === want);
}

/** Each in-scope href once. */
function once(hrefs: string[], repos: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const href of hrefs) {
    if (seen.has(href) || !inScope(href, repos)) continue;
    seen.add(href);
    out.push(href);
  }
  return out;
}

function linkHrefs(nodes: Inline[], out: string[]): void {
  for (const node of nodes) {
    if (node.t === "link") {
      out.push(node.href);
      linkHrefs(node.c, out);
    } else if (node.t === "strong" || node.t === "em") linkHrefs(node.c, out);
  }
}

function blockHrefs(blocks: Block[]): string[] {
  const out: string[] = [];
  for (const block of blocks) {
    if (block.t === "ul" || block.t === "ol") for (const item of block.items) linkHrefs(item, out);
    else if (block.t === "p" || block.t === "quote" || block.t === "h") linkHrefs(block.c, out);
  }
  return out;
}

function requestRef(path: string): Promise<RefFound | null> {
  return getJson<GitHubRefResponse>(path).then((result) => {
    if (result.state !== "ok" || !("title" in result.data)) return null;
    const { title, state } = result.data;
    if (title === "" || (state !== "open" && state !== "closed")) return null;
    return { title, state };
  });
}

/** One read per in-scope href, from GOALIE. An error, or an answer without both title and state, stays absent. A new revision reads again. */
function useRefTitles(goal: string | undefined, hrefs: string[], revision: string | number): ReadonlyMap<string, RefFound> {
  const listKey = hrefs.join("\0");
  const seenKey = `${revision}\0${goal ?? ""}\0${listKey}`;
  const [slot, setSlot] = useState<{ key: string; found: Map<string, RefFound> }>({ key: "", found: new Map() });
  const found = slot.key === seenKey ? slot.found : new Map<string, RefFound>();
  useEffect(() => {
    if (goal === undefined || listKey === "") return;
    let live = true;
    for (const href of listKey.split("\0")) {
      const url = canonicalRefUrl(href);
      if (url === null) continue;
      void refTitle(goal, url, revision, requestRef).then((hit) => {
        if (!live || hit === null) return;
        setSlot((prev) => {
          const base = prev.key === seenKey ? prev.found : new Map<string, RefFound>();
          const next = new Map(base);
          next.set(href, hit);
          return { key: seenKey, found: next };
        });
      });
    }
    return () => {
      live = false;
    };
  }, [goal, listKey, seenKey, revision]);
  return found;
}

/** A work item title. `#N` is the one repository's issue. linksOnly draws those issues and leaves the title text out. */
export function TitleBits({ title, goal, repos, revision = 0, linksOnly = false }: { title: string; goal?: string; repos: string[] | undefined; revision?: string | number; linksOnly?: boolean }) {
  const parts = titleParts(title, repos);
  const shown = linksOnly ? parts.filter((part) => part.t === "link") : parts;
  const hrefs = linksOnly ? shown.flatMap((part) => (part.t === "link" ? [part.href] : [])) : [];
  const titles = useRefTitles(goal, hrefs, revision);
  if (shown.length === 0) return null;
  const bits = shown.map((part, index) =>
    part.t === "text" ? (
      <span key={index}>{part.v}</span>
    ) : (
      <a key={index} className="wissue" href={part.href} target="_blank" rel="noopener noreferrer">
        {linksOnly ? refLabel(part.label, titles.get(part.href) ?? null) : part.label}
      </a>
    ),
  );
  return linksOnly ? <span className="wissues">{bits}</span> : <>{bits}</>;
}

/** Each GitHub issue or pull request named in a work item's links. A pull request keeps its /pull/ URL. goal asks GOALIE for each in-scope title. revision reads those titles again. */
export function IssueLinks({ links, goal, repos, revision = 0 }: { links: string[] | null; goal?: string; repos?: string[]; revision?: string | number }) {
  const issues = githubIssues(links, repos);
  const titles = useRefTitles(goal, once(issues.map((issue) => canonicalRefUrl(issue.href) ?? issue.href), repos), revision);
  if (issues.length === 0) return null;
  return (
    <span className="wissues">
      {issues.map((issue) => (
        <a key={issue.href} className="wissue" href={issue.href} target="_blank" rel="noopener noreferrer">
          {refLabel(issue.label, titles.get(issue.href) ?? null)}
        </a>
      ))}
    </span>
  );
}

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

/** The avatar colors for an actor. The same id keeps the same color. */
export function avatarStyle(id: string): CSSProperties {
  const n = slot(id);
  return { background: `var(--av-${n}-bg)`, color: `var(--av-${n}-ink)` };
}

/**
 * An actor's initial on a palette color. `mine` outlines the signed-in actor's own avatar.
 * The name is the tooltip under the pointer, and a tap shows it too (rule 12). A tap does not open or close the row.
 */
export function Avatar({ actor, mine = false }: { actor: ActorRef; mine?: boolean }) {
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
      style={avatarStyle(actor.id)}
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

/** Markdown text, drawn from the model's tree (GL8). Nothing here reads HTML. A link opens in a new tab. goal asks GOALIE for each in-scope title. revision reads those titles again. */
export function Markdown({ text, inline, goal, repos, revision = 0 }: { text: string; inline?: boolean; goal?: string; repos?: string[]; revision?: number }) {
  const blocks = markdown(text, repos);
  const titles = useRefTitles(goal, once(blockHrefs(blocks), repos), revision);
  // Text inside a sentence (a Path to Green criterion) stays in the sentence when it is one paragraph.
  if (inline && blocks.length === 1 && blocks[0].t === "p") return <Spans of={blocks[0].c} titles={titles} />;
  return (
    <div className="md">
      {blocks.map((b, k) => {
        switch (b.t) {
          case "p":
            return (
              <p key={k}>
                <Spans of={b.c} titles={titles} />
              </p>
            );
          case "quote":
            return (
              <blockquote key={k}>
                <Spans of={b.c} titles={titles} />
              </blockquote>
            );
          case "h": {
            const H = b.level === 1 ? "h3" : "h4";
            return (
              <H key={k}>
                <Spans of={b.c} titles={titles} />
              </H>
            );
          }
          case "ul":
          case "ol": {
            const List = b.t;
            return (
              <List key={k}>
                {b.items.map((item, j) => (
                  <li key={j}>
                    <Spans of={item} titles={titles} />
                  </li>
                ))}
              </List>
            );
          }
          case "code":
            return (
              <pre key={k}>
                <code>{b.v}</code>
              </pre>
            );
        }
      })}
    </div>
  );
}

function Spans({ of, titles }: { of: Inline[]; titles: ReadonlyMap<string, RefFound> }) {
  return of.map((x, k) => {
    switch (x.t) {
      case "text":
        return x.v;
      case "br":
        return <br key={k} />;
      case "code":
        return <code key={k}>{x.v}</code>;
      case "strong":
        return (
          <strong key={k}>
            <Spans of={x.c} titles={titles} />
          </strong>
        );
      case "em":
        return (
          <em key={k}>
            <Spans of={x.c} titles={titles} />
          </em>
        );
      case "link": {
        const found = titles.get(x.href) ?? null;
        return (
          <a key={k} href={x.href} target="_blank" rel="noopener noreferrer">
            <Spans of={x.c} titles={titles} />
            {found ? ` ${found.title} ${found.state}` : null}
          </a>
        );
      }
    }
  });
}
