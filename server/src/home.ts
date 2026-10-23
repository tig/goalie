import { calendarMonth } from "./calendar.ts";
import { BRAND, card, dateMark, escape, healthDot, layout, look, monthLabel, plainDate, type Actor } from "./components.ts";
import { calendarHtml } from "./home-calendar.ts";
import { listHtml } from "./home-list.ts";
import { timelineHtml } from "./home-timeline.ts";
import type { Format, HomeQuery, PrioritiesView } from "./priorities.ts";
import { timelineWindow } from "./timeline.ts";

/**
 * Pages built on the server (ADR 0010). No browser script beyond the shared chrome.
 * Each page is a pure function from view data to HTML, built from components.ts.
 * Home is the page: the cards, the board head, and one drawing of the Priorities view. home-timeline.ts, home-list.ts, and home-calendar.ts draw it.
 * A goal's detail belongs on its goal page, not on Home.
 */

/** The card help. Words from SPEC.md §4, §5, §6.1, §6.9. Each line is HTML. */
const HELP = {
  committed: [
    "<b>Committed dates</b> counts the goals in progress on this list by their health. A Committed date is a promise. Health is judged against it, or against the Promotion Milestone's date.",
    "<b>GREEN</b> On track. The risks are understood and the owner believes the date will be hit.",
    "<b>YELLOW</b> Real unknowns or blockers, with a credible path to the date. This is the time to act.",
    "<b>RED</b> The date is not credible without help, or there is no Path to Green.",
    "A <b>slip</b> is a Committed date that passed before the goal was met.",
    "Point at a health to ring its goals. Click it to show only those goals. Click it again to show all.",
  ],
  drafts: [
    "<b>Drafts</b> are changes an agent proposes, for example a new health with its evidence.",
    "A Draft shows on its goal as soon as the agent makes it. Nothing changes until a human approves it.",
    "Approving or rejecting a Draft is recorded in the goal's history, with who did it and why.",
  ],
  promotions: [
    "<b>Promotions due</b> is the next Promotion Milestone and the days left to it.",
    "A <b>Promotion Milestone</b> is a goal with a committed date, by which another goal's uncommitted date moves up one Date Type.",
    "<b>Fantasy</b> moves to <b>Ambition</b>, and <b>Ambition</b> moves to <b>Committed</b>. A Committed date needs a Plan at Pencil.",
  ],
  committedDate: ["A <b>Committed date</b> is a promise. Health is judged against it, or against the Promotion Milestone's date."],
};

/** A link to Home. It keeps the format, the filter, and the position in force. `null` drops a value. */
function homeUrl(query: HomeQuery, change: { format?: Format; health?: string | null; q?: string | null; from?: string | null } = {}): string {
  const pick = <T,>(changed: T | undefined, current: T) => (changed === undefined ? current : changed);
  const format = pick(change.format, query.format);
  const values: [string, string | undefined | null][] = [
    ["format", format === "timeline" ? undefined : format],
    ["health", pick(change.health, query.health)],
    ["q", pick(change.q, query.q)],
    ["from", pick(change.from, query.from)],
  ];
  const text = values
    .filter((pair): pair is [string, string] => typeof pair[1] === "string" && pair[1] !== "")
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&amp;");
  return text ? `/?${text}` : "/";
}

function cardsHtml(view: PrioritiesView, query: HomeQuery): string {
  const { committed, drafts, nextPromotion } = view.summary;
  const meter = committed.healths.map((h) => `<span data-health="${h ?? ""}" style="background:${look(h).bar}"></span>`).join("");
  const counts = (["RED", "YELLOW", "GREEN"] as const)
    .map((h) => {
      const on = view.filter.health === h;
      return `<a class="count${on ? " on" : ""}" data-health="${h}" href="${homeUrl(query, { health: on ? null : h })}"${on ? ' aria-current="true"' : ""}>${healthDot(h)}${committed.counts[h]} ${h}</a>`;
    })
    .join("");
  const slip = committed.slips[0];
  const slipLine = slip
    ? `<p class="note"><span class="late">slip ${slip.date.slipDays} days</span> past ${dateMark(slip.date, view.today)} · ${escape(slip.summary)}</p>`
    : `<p class="note muted">No slips.</p>`;
  const promo = nextPromotion
    ? `<p class="big">${nextPromotion.days} days <small>to the Promotion Milestone</small></p>
<p class="note">${plainDate(nextPromotion.date, view.today)} · ${escape(nextPromotion.summary)}</p>`
    : `<p class="note muted">No Promotion Milestone is due.</p>`;
  return `<section class="cards">
${card("Committed dates", `<p class="counts">${counts}</p><div class="meter">${meter}</div>${slipLine}`, HELP.committed)}
${card("Drafts", `<p class="big">${drafts} <small>waiting on an owner</small></p>`, HELP.drafts)}
${card("Promotions due", promo, HELP.promotions)}
</section>`;
}

/** One pill: Earlier, the window or the month, Later. Today sits beside it. */
function rangeHtml(query: HomeQuery, label: string, earlier: string, later: string): string {
  return `<nav class="range" aria-label="${query.format === "calendar" ? "Calendar" : "Timeline"}">
<span class="seggroup"><a class="segbtn" href="${homeUrl(query, { from: earlier })}" aria-label="Earlier">‹</a><span class="rangelbl">${label}</span><a class="segbtn" href="${homeUrl(query, { from: later })}" aria-label="Later">›</a></span>
<a class="btn" href="${homeUrl(query, { from: null })}">Today</a>
</nav>`;
}

/** The format toggle: three links in one pill, beside the range. A phone draws a timeline as a list, so there the List link stands for both. */
function toggleHtml(query: HomeQuery): string {
  const link = (format: Format, label: string) => {
    const on = query.format === format;
    const phone = format === "list" && query.format === "timeline" ? " phone-on" : "";
    return `<a class="segbtn fmt fmt-${format}${on ? " on" : ""}${phone}" href="${homeUrl(query, { format })}"${on ? ' aria-current="page"' : ""}>${label}</a>`;
  };
  return `<nav class="seggroup formats" aria-label="Priorities">${link("timeline", "Timeline")}${link("list", "List")}${link("calendar", "Calendar")}</nav>`;
}

/** The search box. A GET form, so it needs no browser script (ADR 0010). It keeps the format, the health filter, and the position. */
function searchHtml(query: HomeQuery): string {
  const keep: [string, string | undefined][] = [
    ["format", query.format === "timeline" ? undefined : query.format],
    ["health", query.health],
    ["from", query.from],
  ];
  const hidden = keep
    .filter((pair): pair is [string, string] => typeof pair[1] === "string")
    .map(([key, value]) => `<input type="hidden" name="${key}" value="${escape(value)}">`)
    .join("");
  return `<form class="search" method="get" action="/" role="search">${hidden}<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="7" cy="7" r="5"/><path d="m11 11 3.5 3.5"/></svg><input type="search" name="q" value="${escape(query.q ?? "")}" placeholder="Search goals" aria-label="Search goals"></form>`;
}

/** The filter in force, beside the heading, with the way out. */
function filterHtml(query: HomeQuery): string {
  const { health, q } = query;
  if (!health && !q) return "";
  return `<span class="filter">${health ? `${healthDot(health)}${health}` : ""}${health && q ? " · " : ""}${q ? `“${escape(q)}”` : ""}<a class="clear" href="${homeUrl(query, { health: null, q: null })}">Show all</a></span>`;
}

/** The board head's range and the drawing, for the format in use. A timeline page also carries the list, which a phone shows instead. */
function drawingHtml(view: PrioritiesView, actor: Actor, query: HomeQuery): { range: string; body: string } {
  const search = searchHtml(query);
  if (query.format === "list") return { range: "", body: listHtml(view, actor, search) };
  if (query.format === "calendar") {
    const month = calendarMonth(view, query.from);
    return { range: rangeHtml(query, escape(monthLabel(month.month)), month.earlier, month.later), body: calendarHtml(view, month, search) };
  }
  const window = timelineWindow(view, query.from);
  const label = `${plainDate(window.first, view.today)} – ${plainDate(window.last, view.today)}`;
  return {
    range: rangeHtml(query, label, window.earlier, window.later),
    body: `${timelineHtml(view, actor, window, search, HELP.committedDate)}\n${listHtml(view, actor, search, true)}`,
  };
}

export function homePage(view: PrioritiesView, actor: Actor, query: HomeQuery = { format: "timeline" }): string {
  const { range, body } = drawingHtml(view, actor, query);
  return layout({
    actor,
    org: view.org.name,
    main: `<h1>${escape(view.org.name)}</h1>
${cardsHtml(view, query)}
<section class="card board" data-format="${query.format}">
<div class="bhead"><h2>Priorities</h2>${filterHtml(query)}<span class="tools">${toggleHtml(query)}${range}</span></div>
${body}
</section>`,
  });
}

/** The page for a request with no verified actor. It gives the reason. */
export function signInPage(reason: string): string {
  return layout({
    mainClass: "signin",
    main: `<h1>Sign in to ${escape(BRAND.app)}</h1>
<p>${escape(BRAND.app)} shows goals only to a signed-in actor.</p>
<p class="small">Not signed in: ${escape(reason)}.</p>`,
  });
}
