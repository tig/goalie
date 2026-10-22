import { avatar, BRAND, card, dateMark, escape, healthDot, layout, look, rankBadge, tip, type Actor } from "./components.ts";
import { shortDate, type GoalRow, type Lane, type PrioritiesView, type PriorityRow } from "./priorities.ts";

/**
 * Pages built on the server (ADR 0010). No browser script beyond the shared chrome.
 * Each page is a pure function from view data to HTML, built from components.ts.
 * The look is the v1 canvas Home board. Detail that is not needed at a glance sits in a hover card.
 */

/** SPEC.md §4. Shown on hover, not on the page. */
const PROMOTION_MILESTONE = "A goal with a committed date, by which another goal's uncommitted date moves up one Date Type.";

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

/** The hover card: the goal's key, owner, health, dates, and first PTG step. */
function goalTip(view: PrioritiesView, goal: GoalRow): string {
  const lines = [
    `<span class="tipkey">${escape(goal.id)}</span>`,
    `<span>${escape(goal.ownerName)}</span>${goal.health ? ` · ${escape(goal.health)}` : ` · ${escape(goal.state)}`}`,
    ...(goal.when.length ? [goal.when.map(dateMark).join(" · ")] : []),
    ...(goal.ptg
      ? [`<b>PTG</b> ${escape(goal.ptg.text)}${goal.ptg.ownerName ? ` · ${escape(goal.ptg.ownerName)}` : ""}${goal.ptg.date ? ` · ${dateMark(shortDate(goal.ptg.date, view.today))}` : ""}`]
      : []),
  ];
  return tip(lines);
}

function goalHtml(view: PrioritiesView, actor: Actor, goal: GoalRow, rank?: number): string {
  const kids = goal.children.length;
  const mark = goal.depth === 0 && rank !== undefined ? rankBadge(rank, goal.health) : healthDot(goal.health);
  const toggle = kids ? `<span class="chev"><span class="n">${kids}</span>${CHEVRON}</span>` : "";
  const left = `<div class="left">${mark}<span class="title">${escape(goal.summary)}</span>${avatar({ id: goal.owner, name: goal.ownerName }, goal.owner === actor.id)}${toggle}${goalTip(view, goal)}</div>`;
  const when = goal.when.length ? `<div class="when">${goal.when.map(dateMark).join(" · ")}</div>` : "";
  const row = `<div class="row d${Math.min(goal.depth, 2)}" id="goal-${escape(goal.id)}" data-health="${goal.health ?? ""}" style="--depth:${goal.depth}" tabindex="0">${left}${when}<div class="lane">${laneHtml(goal.lane, goal)}</div></div>`;
  if (!kids) return row;
  const children = goal.children.map((c) => goalHtml(view, actor, c)).join("");
  return `<details${goal.depth === 0 ? " open" : ""}><summary>${row}</summary><div class="kids" style="--pd:${goal.depth}">${children}</div></details>`;
}

function priorityHtml(view: PrioritiesView, actor: Actor, priority: PriorityRow): string {
  const goals = priority.goals.length
    ? priority.goals.map((g, i) => goalHtml(view, actor, g, i === 0 ? priority.rank : undefined)).join("")
    : `<div class="row d0" style="--depth:0"><div class="left">${rankBadge(priority.rank, null)}<span class="title muted">${escape(priority.title)}</span></div><div class="lane"></div></div>`;
  return `<div class="group" id="priority-${escape(priority.id)}">${goals}</div>`;
}

function cardsHtml(view: PrioritiesView): string {
  const { committed, drafts, nextPromotion } = view.summary;
  const meter = committed.healths.map((h) => `<span style="background:${look(h).bar}"></span>`).join("");
  const counts = (["RED", "YELLOW", "GREEN"] as const)
    .map((h) => `<span class="count">${healthDot(h)}${committed.counts[h]} ${h}</span>`)
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
${card("Committed dates", `<p class="counts">${counts}</p><div class="meter">${meter}</div>${slipLine}`)}
${card("Drafts", `<p class="big">${drafts} <small>waiting on an owner</small></p>`, "An agent's Draft takes effect only when a human approves it.")}
${card("Promotions due", promo, PROMOTION_MILESTONE)}
</section>`;
}

function rangeHtml(view: PrioritiesView): string {
  const { first, last, earlier, later } = view.window;
  return `<nav class="range" aria-label="Timeline">
<a class="navb" href="/?from=${earlier}" aria-label="Earlier">‹</a>
<span class="rangelbl">${dateMark(shortDate(first, view.today))} – ${dateMark(shortDate(last, view.today))}</span>
<a class="navb" href="/?from=${later}" aria-label="Later">›</a>
<a class="btn" href="/">Today</a>
</nav>`;
}

function legendHtml(): string {
  const item = (swatch: string, label: string, help?: string) =>
    `<span class="lg"${help ? ` tabindex="0"` : ""}><i class="sw ${swatch}"></i>${escape(label)}${help ? tip([escape(help)]) : ""}</span>`;
  return `<div class="legend">
${item("health", "Health")}
${item("ahead", "Committed date", "A promise. Health is judged against it, or against the Promotion Milestone's date.")}
${item("Ambition", "Ambition date")}
${item("Fantasy", "Fantasy date")}
${item("slip", "Slip")}
</div>`;
}

export function homePage(view: PrioritiesView, actor: Actor): string {
  const weeks = view.weeks.map((w) => `<span class="wk" style="left:${pct(w.at)}">${escape(w.label)}</span>`).join("");
  const grid = view.weeks.map((w) => `<span class="gl" style="left:${pct(w.at)}"></span>`).join("");
  const backlog = view.backlog.length
    ? view.backlog.map((p) => priorityHtml(view, actor, p)).join("")
    : `<p class="empty">No Priorities below the cut line.</p>`;
  return layout({
    actor,
    org: view.org.name,
    main: `<h1>${escape(view.org.name)}</h1>
${cardsHtml(view)}
<section class="card board">
<div class="bhead"><h2>Priorities</h2>${rangeHtml(view)}</div>
<div class="scroll"><div class="tl">
<div class="axis"><div></div><div class="ticks"><span class="todaylbl" style="left:${pct(view.todayAt)}">Today</span>${weeks}</div></div>
<div class="tlbody">
<div class="grid" aria-hidden="true">${grid}</div>
<div class="nowline" aria-hidden="true"><span class="today" style="left:${pct(view.todayAt)}"></span></div>
${view.funded.map((p) => priorityHtml(view, actor, p)).join("\n")}
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
