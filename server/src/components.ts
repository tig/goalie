import { day, type GoalDate, type GoalRow, type Health, type PriorityRow } from "./priorities.ts";
import { AVATAR_COLORS, STYLE } from "./styles.ts";

/**
 * The shared parts every page is built from (ADR 0010). Each part is a pure function to HTML.
 * Host configuration serves the shared chrome at /_xw/. chrome.js adds the navbar and the footer.
 */

/** The one brand object. An organization reskins GOALIE here and in the :root tokens. */
export const BRAND = {
  app: "Goalie",
  mark: "G",
  chrome: "/_xw/",
  font: { family: '"Figtree",system-ui,sans-serif', href: "https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&amp;display=swap" },
} as const;

export type Actor = { id: string; name: string };

export function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const HEALTH: Record<string, { bg: string; ink: string; bar: string }> = {
  GREEN: { bg: "var(--green-bg)", ink: "var(--green-ink)", bar: "var(--green)" },
  YELLOW: { bg: "var(--yellow-bg)", ink: "var(--yellow-ink)", bar: "var(--yellow)" },
  RED: { bg: "var(--red-bg)", ink: "var(--red-ink)", bar: "var(--red)" },
  none: { bg: "var(--none-bg)", ink: "var(--mute)", bar: "var(--none)" },
};

/** The token colors for a health. No health is grey. */
export const look = (health: Health) => HEALTH[health ?? "none"];

/** The page shell: head, chrome, top bar, and main. */
export function layout(body: { actor?: Actor; org?: string; main: string; mainClass?: string }): string {
  const chrome = BRAND.chrome;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escape(BRAND.app)}</title>
<link rel="icon" type="image/svg+xml" href="${chrome}brand/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="${chrome}brand/favicon-32.png">
<link rel="stylesheet" href="${chrome}chrome.css">
<script src="${chrome}chrome.js" defer></script>
<meta name="xw-app" content="${escape(BRAND.app)}">
<link rel="stylesheet" href="${BRAND.font.href}">
${STYLE}
<style>:root{--font:${BRAND.font.family}}</style>
</head>
<body>
${topBar(body.actor, body.org)}
<main${body.mainClass ? ` class="${body.mainClass}"` : ""}>
${body.main}
</main>
</body>
</html>
`;
}

export function topBar(actor?: Actor, org?: string): string {
  const me = actor ? `<span class="me">${avatar(actor)}</span>` : "";
  const unit = org ? `<span class="org">/ ${escape(org)}</span>` : "";
  return `<header class="top"><span class="logo">${escape(BRAND.mark)}</span><span class="brand">${escape(BRAND.app)}</span>${unit}${actor ? '<span class="tab">Home</span>' : ""}${me}</header>`;
}

/** A stable palette slot for an actor id. */
function slot(id: string): number {
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return hash % AVATAR_COLORS;
}

/** An actor's initial on a palette color. `mine` outlines the signed-in actor's own avatar. */
export function avatar(actor: Actor, mine = false): string {
  const n = slot(actor.id);
  return `<span class="av${mine ? " mine" : ""}" style="background:var(--av-${n}-bg);color:var(--av-${n}-ink)" title="${escape(actor.name)}">${escape(actor.name.slice(0, 1))}</span>`;
}

/** Text a screen reader reads and the eye does not see. */
const hidden = (text: string) => `<span class="vh">${escape(text)}</span>`;

/** The health as a dot of its color. The word is there for a screen reader. No health is a hollow dot. */
export function healthDot(health: Health): string {
  const l = look(health);
  return `<span class="hdot${health ? "" : " none"}" style="background:${health ? l.bar : "transparent"}"></span>${hidden(health ?? "no health")}`;
}

/** The Priority rank as a plain number. An empty slot keeps the columns aligned on rows with no rank. */
export function rankNumber(rank?: number): string {
  return `<span class="rnum">${rank ?? ""}</span>`;
}

/** A hover card. Each line is HTML. It shows on hover and on keyboard focus of its parent. */
export function tip(lines: string[]): string {
  return `<div class="tip" role="note">${lines.map((l) => `<div>${l}</div>`).join("")}</div>`;
}

const MONTH_DAY = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
const MONTH_DAY_YEAR = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const MONTH_YEAR = new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" });

/** "Oct 1", or "Mar 31, 2027" outside the current year. */
export function shortDate(iso: string, todayIso: string): string {
  const format = iso.slice(0, 4) === todayIso.slice(0, 4) ? MONTH_DAY : MONTH_DAY_YEAR;
  return format.format(day(iso));
}

/** "October 2026". */
export const monthLabel = (iso: string) => MONTH_YEAR.format(day(iso));

/** A goal date as text, with its Date Type: "Committed Oct 1". */
export const dateLabel = (date: GoalDate, todayIso: string) => `${date.kind} ${shortDate(date.date, todayIso)}`;

/** A goal date with its Date Type. It does not wrap inside. */
export function dateMark(date: GoalDate, todayIso: string): string {
  return `<span class="date">${escape(dateLabel(date, todayIso))}</span>`;
}

/** A day that is not a goal date, such as an edge of the timeline window. It does not wrap inside. */
export function plainDate(iso: string, todayIso: string): string {
  return `<span class="date">${escape(shortDate(iso, todayIso))}</span>`;
}

/** A ? icon that opens its help on click, on Enter, or on hover. A details element, so it needs no browser script. Each line is HTML. */
export function help(label: string, lines: string[]): string {
  return `<details class="help"><summary class="q" aria-label="What ${escape(label)} means">?</summary>${tip(lines)}</details>`;
}

/** A summary card. `lines` is its help, shown from the ? icon by the label. */
export function card(label: string, body: string, lines?: string[]): string {
  const heading = `<div class="lbl">${escape(label)}${lines ? help(label, lines) : ""}</div>`;
  return `<div class="card">${heading}${body}</div>`;
}

const CHEVRON = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5"/></svg>';

/** Each tree level indents this much. */
const INDENT = 26;
/** The x of the health dot's center at a level: the rank column, the gap, the indent, half the dot. */
const railX = (level: number) => `${28 + level * INDENT + 5}px`;

/**
 * The goal column of a row: rank, health, title, count, owner. The List and the Timeline share it.
 * `rails` are the levels whose guide line passes this row on its way to a later sibling. `last` is true for the last goal under its parent.
 */
export function goalCell(goal: GoalRow, actor: Actor, rank?: number, rails: number[] = [], last = true): string {
  const kids = goal.children.length;
  const toggle = kids ? `<span class="chev"><span class="n">${kids}</span>${CHEVRON}</span>` : "";
  const passing = rails.length
    ? ` style="background-image:${rails.map(() => "linear-gradient(var(--cut),var(--cut))").join(",")};background-position:${rails.map((l) => `${railX(l)} 0`).join(",")}"`
    : "";
  const guide = goal.depth > 0 ? (last ? " tree" : " tree more") : "";
  return `<div class="left${guide}"${passing}>${rankNumber(rank)}${healthDot(goal.health)}<span class="title">${escape(goal.summary)}</span><span class="slot">${toggle}</span>${avatar({ id: goal.owner, name: goal.ownerName }, goal.owner === actor.id)}</div>`;
}

/** How a drawing fills a goal tree: the cells right of the goal column, and whether rows carry their goal id. A page gives each id to one drawing only. */
export type TreeDrawing = { actor: Actor; filtering: boolean; ids: boolean; cells: (goal: GoalRow) => string; blank: string };

/** One goal row, then the goals under it. A top-level goal starts open, a deeper one closed. A filter opens every level. */
export function goalTree(drawing: TreeDrawing, goal: GoalRow, rank?: number, rails: number[] = [], last = true): string {
  const kids = goal.children.length;
  const id = drawing.ids ? ` id="goal-${escape(goal.id)}"` : "";
  const row = `<div class="row d${Math.min(goal.depth, 2)}${goal.match ? "" : " ctx"}"${id} data-health="${goal.health ?? ""}" style="--depth:${goal.depth}">${goalCell(goal, drawing.actor, rank, rails, last)}${drawing.cells(goal)}</div>`;
  if (!kids) return row;
  const childRails = goal.depth > 0 && !last ? [...rails, goal.depth - 1] : rails;
  const children = goal.children.map((c, i) => goalTree(drawing, c, undefined, childRails, i === kids - 1)).join("");
  return `<details${goal.depth === 0 || drawing.filtering ? " open" : ""}><summary>${row}</summary><div class="kids">${children}</div></details>`;
}

/** One Priority: its goals as trees, its rank on the first. A Priority with no goals draws its title with its rank. */
export function priorityGroup(drawing: TreeDrawing, priority: PriorityRow): string {
  const goals = priority.goals.length
    ? priority.goals.map((g, i) => goalTree(drawing, g, i === 0 ? priority.rank : undefined)).join("")
    : `<div class="row d0" style="--depth:0"><div class="left">${rankNumber(priority.rank)}${healthDot(null)}<span class="title muted">${escape(priority.title)}</span><span class="slot"></span></div>${drawing.blank}</div>`;
  return `<div class="group"${drawing.ids ? ` id="priority-${escape(priority.id)}"` : ""}>${goals}</div>`;
}

/** A line of text in the goal column, pinned like a goal name. */
const note = (drawing: TreeDrawing, text: string) => `<div class="row note"><div class="left"><span class="rnum"></span><span class="title muted">${escape(text)}</span></div>${drawing.blank}</div>`;

/** The funded Priorities, the cut line, then the backlog. A filter that matches nothing says so. */
export function priorityRows(drawing: TreeDrawing, funded: PriorityRow[], backlog: PriorityRow[]): string {
  const below = backlog.length
    ? backlog.map((p) => priorityGroup(drawing, p)).join("")
    : drawing.filtering ? "" : note(drawing, "No Priorities below the cut line.");
  const none = drawing.filtering && !funded.length && !backlog.length ? note(drawing, "No goals match.") : "";
  return `${funded.map((p) => priorityGroup(drawing, p)).join("\n")}${none}
<div class="cut"><span>✂ Backlog</span></div>
${below}`;
}
