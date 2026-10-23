import { avatar, BRAND, card, dateMark, escape, healthDot, help, layout, look, rankNumber, type Actor } from "./components.ts";
import { shortDate, type GoalRow, type Lane, type PrioritiesView, type PriorityRow } from "./priorities.ts";

/**
 * Pages built on the server (ADR 0010). No browser script beyond the shared chrome.
 * Each page is a pure function from view data to HTML, built from components.ts.
 * The look is the v1 canvas Home board. A goal's detail belongs on its goal page, not on Home.
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

/** A link to Home that keeps the filter in force. `null` drops a value. */
function homeUrl(view: PrioritiesView, change: { health?: string | null; q?: string | null; from?: string | null } = {}): string {
  const values: [string, string | undefined | null][] = [
    ["health", change.health === undefined ? view.filter.health : change.health],
    ["q", change.q === undefined ? view.filter.q : change.q],
    ["from", change.from],
  ];
  const query = values
    .filter((pair): pair is [string, string] => typeof pair[1] === "string" && pair[1] !== "")
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&amp;");
  return query ? `/?${query}` : "/";
}

const pct = (n: number) => `${n.toFixed(2)}%`;

/** A segment span. Round only the outer ends of the bar. */
function seg(cls: string, from: number, to: number, style = "", first = false, last = false): string {
  if (to <= from) return "";
  const ends = `${first ? " first" : ""}${last ? " last" : ""}`;
  return `<span class="seg ${cls}${ends}" style="left:${pct(from)};width:${pct(to - from)};${style}"></span>`;
}

/** A date past the edge of the window, written at that edge with an arrow. */
function edge(side: "before" | "after" | null, kind: string, label: string, color?: string): string {
  const text = side === "before" ? `← ${label}` : `${label} →`;
  return `<span class="edge ${side} ${kind}"${color ? ` style="color:${color}"` : ""}>${escape(text)}</span>`;
}

function laneHtml(lane: Lane, goal: GoalRow): string {
  const parts: string[] = [];
  const l = look(goal.health);
  const pieces = [lane.health && "health", lane.slip && "slip", lane.ahead && "ahead"].filter(Boolean);
  const first = pieces[0];
  const last = pieces[pieces.length - 1];
  if (lane.health) parts.push(seg("health", lane.health.from, lane.health.to, `background:${l.bar}`, first === "health", last === "health"));
  if (lane.slip) parts.push(seg("slip", lane.slip.from, lane.slip.to, "", first === "slip", last === "slip"));
  if (lane.ahead) parts.push(seg("ahead", lane.ahead.from, lane.ahead.to, goal.health ? `background:${l.bg}` : "", first === "ahead", last === "ahead"));
  if (lane.line && lane.line.to > lane.line.from) {
    parts.push(`<span class="line ${lane.line.kind}" style="left:${pct(lane.line.from)};width:${pct(lane.line.to - lane.line.from)}"></span>`);
  }
  const slip = lane.slip ? ` · slip ${lane.slip.days} days` : "";
  const tickInk = lane.slip ? "var(--red-ink)" : "var(--ink)";
  if (lane.tick && !lane.tick.outside) {
    const side = lane.tick.at > 70 ? `left:calc(${pct(lane.tick.at)} - 6px);transform:translateX(-100%)` : `left:calc(${pct(lane.tick.at)} + 6px)`;
    parts.push(`<span class="tick" style="left:${pct(lane.tick.at)}"></span>`);
    parts.push(`<span class="ticklbl" style="${side};color:${tickInk}">${escape(lane.tick.label + slip)}</span>`);
  } else if (lane.tick) {
    parts.push(edge(lane.tick.outside, "", lane.tick.label + slip, tickInk));
  }
  if (lane.end && !lane.end.outside) {
    const side = lane.end.at > 85 ? `right:calc(100% - ${pct(lane.end.at)} - 3px)` : `left:calc(${pct(lane.end.at)} - 3px)`;
    parts.push(`<span class="dot ${lane.end.kind}" style="left:${pct(lane.end.at)}"></span>`);
    parts.push(`<span class="endlbl ${lane.end.kind}" style="${side}">${escape(lane.end.label)}</span>`);
  } else if (lane.end) {
    parts.push(edge(lane.end.outside, lane.end.kind, lane.end.label));
  }
  return parts.join("");
}

const CHEVRON = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5"/></svg>';

/** Each tree level indents this much. */
const INDENT = 26;
/** The x of the health dot's center at a level: the rank column, the gap, the indent, half the dot. */
const railX = (level: number) => `${28 + level * INDENT + 5}px`;

/**
 * One goal row, then the goals under it. Every row has the same columns: rank, health, title, count, owner.
 * `rails` are the levels whose guide line passes this row on its way to a later sibling. `last` is true for the last goal under its parent.
 * The guides are drawn inside the pinned left column, so they stay in place while the timeline scrolls.
 */
function goalHtml(view: PrioritiesView, actor: Actor, goal: GoalRow, rank?: number, rails: number[] = [], last = true): string {
  const filtering = Boolean(view.filter.health || view.filter.q);
  const kids = goal.children.length;
  const toggle = kids ? `<span class="chev"><span class="n">${kids}</span>${CHEVRON}</span>` : "";
  const passing = rails.length
    ? ` style="background-image:${rails.map(() => "linear-gradient(var(--cut),var(--cut))").join(",")};background-position:${rails.map((l) => `${railX(l)} 0`).join(",")}"`
    : "";
  const guide = goal.depth > 0 ? (last ? " tree" : " tree more") : "";
  const left = `<div class="left${guide}"${passing}>${rankNumber(rank)}${healthDot(goal.health)}<span class="title">${escape(goal.summary)}</span><span class="slot">${toggle}</span>${avatar({ id: goal.owner, name: goal.ownerName }, goal.owner === actor.id)}</div>`;
  const when = goal.when.length ? `<div class="when">${goal.when.map(dateMark).join(" · ")}</div>` : "";
  const row = `<div class="row d${Math.min(goal.depth, 2)}${goal.match ? "" : " ctx"}" id="goal-${escape(goal.id)}" data-health="${goal.health ?? ""}" style="--depth:${goal.depth}">${left}${when}<div class="lane">${laneHtml(goal.lane, goal)}</div></div>`;
  if (!kids) return row;
  const childRails = goal.depth > 0 && !last ? [...rails, goal.depth - 1] : rails;
  const children = goal.children.map((c, i) => goalHtml(view, actor, c, undefined, childRails, i === kids - 1)).join("");
  return `<details${goal.depth === 0 || filtering ? " open" : ""}><summary>${row}</summary><div class="kids">${children}</div></details>`;
}

function priorityHtml(view: PrioritiesView, actor: Actor, priority: PriorityRow): string {
  const goals = priority.goals.length
    ? priority.goals.map((g, i) => goalHtml(view, actor, g, i === 0 ? priority.rank : undefined)).join("")
    : `<div class="row d0" style="--depth:0"><div class="left">${rankNumber(priority.rank)}${healthDot(null)}<span class="title muted">${escape(priority.title)}</span><span class="slot"></span></div><div class="lane"></div></div>`;
  return `<div class="group" id="priority-${escape(priority.id)}">${goals}</div>`;
}

function cardsHtml(view: PrioritiesView): string {
  const { committed, drafts, nextPromotion } = view.summary;
  const meter = committed.healths.map((h) => `<span data-health="${h ?? ""}" style="background:${look(h).bar}"></span>`).join("");
  const counts = (["RED", "YELLOW", "GREEN"] as const)
    .map((h) => {
      const on = view.filter.health === h;
      return `<a class="count${on ? " on" : ""}" data-health="${h}" href="${homeUrl(view, { health: on ? null : h })}"${on ? ' aria-current="true"' : ""}>${healthDot(h)}${committed.counts[h]} ${h}</a>`;
    })
    .join("");
  const slip = committed.slips[0];
  const slipLine = slip
    ? `<p class="note"><span class="late">slip ${slip.days} days</span> past ${dateMark(slip.date)} · ${escape(slip.summary)}</p>`
    : `<p class="note muted">No slips.</p>`;
  const promo = nextPromotion
    ? `<p class="big">${nextPromotion.days} days <small>to the Promotion Milestone</small></p>
<p class="note">${dateMark(shortDate(nextPromotion.date, view.today))} · ${escape(nextPromotion.summary)}</p>`
    : `<p class="note muted">No Promotion Milestone is due.</p>`;
  return `<section class="cards">
${card("Committed dates", `<p class="counts">${counts}</p><div class="meter">${meter}</div>${slipLine}`, HELP.committed)}
${card("Drafts", `<p class="big">${drafts} <small>waiting on an owner</small></p>`, HELP.drafts)}
${card("Promotions due", promo, HELP.promotions)}
</section>`;
}

/** One pill: Earlier, the window, Later. Today sits beside it. */
function rangeHtml(view: PrioritiesView): string {
  const { first, last, earlier, later } = view.window;
  return `<nav class="range" aria-label="Timeline">
<span class="seggroup"><a class="segbtn" href="${homeUrl(view, { from: earlier })}" aria-label="Earlier">‹</a><span class="rangelbl">${dateMark(shortDate(first, view.today))} – ${dateMark(shortDate(last, view.today))}</span><a class="segbtn" href="${homeUrl(view, { from: later })}" aria-label="Later">›</a></span>
<a class="btn" href="${homeUrl(view)}">Today</a>
</nav>`;
}

/** The search box. A GET form, so it needs no browser script (ADR 0010). It sits above the goal column. */
function searchHtml(view: PrioritiesView): string {
  const { health, q } = view.filter;
  const keep = health ? `<input type="hidden" name="health" value="${health}">` : "";
  return `<form class="search" method="get" action="/" role="search">${keep}<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="7" cy="7" r="5"/><path d="m11 11 3.5 3.5"/></svg><input type="search" name="q" value="${escape(q ?? "")}" placeholder="Search goals" aria-label="Search goals"></form>`;
}

/** The filter in force, beside the heading, with the way out. */
function filterHtml(view: PrioritiesView): string {
  const { health, q } = view.filter;
  if (!health && !q) return "";
  return `<span class="filter">${health ? `${healthDot(health)}${health}` : ""}${health && q ? " · " : ""}${q ? `“${escape(q)}”` : ""}<a class="clear" href="/">Show all</a></span>`;
}

function legendHtml(): string {
  const item = (swatch: string, label: string, lines?: string[]) => `<span class="lg"><i class="sw ${swatch}"></i>${escape(label)}${lines ? help(label, lines) : ""}</span>`;
  return `<div class="legend">
${item("health", "Health")}
${item("ahead", "Committed date", HELP.committedDate)}
${item("Ambition", "Ambition date")}
${item("Fantasy", "Fantasy date")}
${item("slip", "Slip")}
</div>`;
}

/** A line of text in the goal column, pinned like a goal name. */
const note = (text: string) => `<div class="row note"><div class="left"><span class="rnum"></span><span class="title muted">${escape(text)}</span></div><div class="lane"></div></div>`;

export function homePage(view: PrioritiesView, actor: Actor): string {
  const weeks = view.weeks.map((w) => `<span class="wk" style="left:${pct(w.at)}">${escape(w.label)}</span>${w.open ? `<span class="opens" style="left:calc(${pct(w.at)} - var(--left) - var(--gap))" aria-hidden="true"></span>` : ""}`).join("");
  const filtering = Boolean(view.filter.health || view.filter.q);
  const backlog = view.backlog.length
    ? view.backlog.map((p) => priorityHtml(view, actor, p)).join("")
    : filtering ? "" : note("No Priorities below the cut line.");
  const none = filtering && !view.funded.length && !view.backlog.length ? note("No goals match.") : "";
  return layout({
    actor,
    org: view.org.name,
    main: `<h1>${escape(view.org.name)}</h1>
${cardsHtml(view)}
<section class="card board">
<div class="bhead"><h2>Priorities</h2>${filterHtml(view)}${rangeHtml(view)}</div>
<div class="scroll"><div class="tl" style="--weeks:${view.weeks.length};--now:${view.todayAt.toFixed(2)}">
<div class="axis"><div class="corner">${searchHtml(view)}</div><div class="ticks"><span class="todaylbl" style="left:${pct(view.todayAt)}">Today</span>${weeks}</div></div>
<div class="tlbody">
${view.funded.map((p) => priorityHtml(view, actor, p)).join("\n")}${none}
<div class="cut"><span>✂ Backlog</span></div>
${backlog}
</div>
</div></div>
${legendHtml()}
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
