import type { Health } from "./priorities.ts";
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

/** The health as a word on its color. No pill for a goal with no health. */
export function healthChip(health: Health): string {
  if (!health) return "";
  const l = look(health);
  return `<span class="chip" style="background:${l.bg};color:${l.ink}">${health}</span>`;
}

export function rankBadge(rank: number, health: Health): string {
  const l = look(health);
  const ring = health ? `;box-shadow:inset 0 0 0 1.5px ${l.bar}` : "";
  return `<span class="rank" style="background:${l.bg};color:${l.ink}${ring}">${rank}</span>`;
}

/** A date with its Date Type. It does not wrap inside. */
export function dateMark(label: string): string {
  return `<span class="date">${escape(label)}</span>`;
}

export function card(label: string, body: string): string {
  return `<div class="card"><p class="lbl">${escape(label)}</p>${body}</div>`;
}
