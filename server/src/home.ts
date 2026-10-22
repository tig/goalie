import { avatar, BRAND, card, dateMark, escape, healthChip, layout, look, rankBadge, type Actor } from "./components.ts";
import { shortDate, type GoalRow, type Lane, type PrioritiesView, type PriorityRow } from "./priorities.ts";

/**
 * Pages built on the server (ADR 0010). No browser script beyond the shared chrome.
 * Each page is a pure function from view data to HTML, built from components.ts.
 * The look is the v1 canvas Home board.
 */

/** SPEC.md §4, said once on the card and once in the legend. */
const PROMOTION_MILESTONE = "A Promotion Milestone is a goal with a committed date, by which another goal's uncommitted date moves up one Date Type.";

const pct = (n: number) => `${n.toFixed(2)}%`;

function grid(view: PrioritiesView): string {
  return view.weeks.map((w) => `<span class="gl" style="left:${pct(w.at)}"></span>`).join("") + `<span class="today" style="left:${pct(view.todayAt)}"></span>`;
}

/** A segment span. Round only the outer ends of the bar. */
function seg(cls: string, from: number, to: number, style = "", first = false, last = false): string {
  if (to <= from) return "";
  const ends = `${first ? " first" : ""}${last ? " last" : ""}`;
  return `<span class="seg ${cls}${ends}" style="left:${pct(from)};width:${pct(to - from)};${style}"></span>`;
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
  if (lane.tick && !lane.tick.outside) {
    const slip = lane.slip ? ` · slip ${lane.slip.days} days` : "";
    const side = lane.tick.at > 70 ? `left:calc(${pct(lane.tick.at)} - 6px);transform:translateX(-100%)` : `left:calc(${pct(lane.tick.at)} + 6px)`;
    parts.push(`<span class="tick" style="left:${pct(lane.tick.at)}"></span>`);
    parts.push(`<span class="ticklbl" style="${side};color:${lane.slip ? "var(--red-ink)" : "var(--ink)"}">${escape(lane.tick.label + slip)}</span>`);
  } else if (lane.tick) {
    const slip = lane.slip ? ` · slip ${lane.slip.days} days` : "";
    parts.push(edge(lane.tick.outside, "", lane.tick.label + slip, lane.slip ? "var(--red-ink)" : "var(--ink)"));
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

/** A date past the edge of the window, written at that edge with an arrow. */
function edge(side: "before" | "after" | null, kind: string, label: string, color?: string): string {
  const text = side === "before" ? `← ${label}` : `${label} →`;
  return `<span class="edge ${side} ${kind}"${color ? ` style="color:${color}"` : ""}>${escape(text)}</span>`;
}

const CHEVRON = '<span class="chev" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5 6 7.5 9 4.5"/></svg></span>';

function goalHtml(view: PrioritiesView, actor: Actor, goal: GoalRow, rank?: number): string {
  const badge = rank === undefined ? "" : rankBadge(rank, goal.health);
  const indent = goal.depth > 0 ? `style="padding-left:${42 + (goal.depth - 1) * 22}px"` : "";
  const kids = goal.children.length;
  const owner = `<span class="who">${avatar({ id: goal.owner, name: goal.ownerName }, goal.owner === actor.id)}<span>${escape(goal.ownerName)}</span></span>`;
  const ptg = goal.ptg
    ? `<div class="ptg"><b>PTG</b> · ${escape(goal.ptg.text)}${goal.ptg.ownerName ? ` · ${escape(goal.ptg.ownerName)}` : ""}${goal.ptg.date ? ` · ${dateMark(shortDate(goal.ptg.date, view.today))}` : ""}</div>`
    : "";
  const when = goal.when.length ? `<div class="when">${goal.when.map(dateMark).join(" · ")}</div>` : "";
  const left = `<div class="left" ${indent}>${badge}<div class="body"><div class="title" title="${escape(goal.summary)}">${escape(goal.summary)}</div>
<div class="meta">${owner}<span>${escape(goal.id)}</span>${healthChip(goal.health)}</div>${ptg}${when}</div>${kids ? CHEVRON : ""}</div>`;
  const row = `<div class="row${goal.depth > 0 ? " sub" : ""}" id="goal-${escape(goal.id)}" data-health="${goal.health ?? ""}">${left}<div class="lane">${grid(view)}${laneHtml(goal.lane, goal)}</div></div>`;
  if (!kids) return row;
  return `<details open><summary>${row}</summary><div class="kids">${goal.children.map((c) => goalHtml(view, actor, c)).join("")}</div></details>`;
}

function priorityHtml(view: PrioritiesView, actor: Actor, priority: PriorityRow): string {
  if (priority.goals.length === 0) {
    return `<div class="row" id="priority-${escape(priority.id)}"><div class="left">${rankBadge(priority.rank, null)}<div class="body"><div class="title">${escape(priority.title)}</div></div></div><div class="lane">${grid(view)}</div></div>`;
  }
  return priority.goals.map((g, i) => goalHtml(view, actor, g, i === 0 ? priority.rank : undefined)).join("");
}

function cardsHtml(view: PrioritiesView): string {
  const { committed, drafts, nextPromotion } = view.summary;
  const meter = committed.healths.map((h) => `<span style="background:${look(h).bar}"></span>`).join("");
  const counts = (["RED", "YELLOW", "GREEN"] as const).map((h) => `${committed.counts[h]} ${h}`).join(" · ");
  const slip = committed.slips[0];
  const slipLine = slip
    ? `<p class="note"><span class="late">●</span> ${escape(slip.id)} ${escape(slip.summary)}: <span class="late">slip ${slip.days} days</span> past ${dateMark(slip.date)}</p>`
    : `<p class="note small">No slips.</p>`;
  const promo = nextPromotion
    ? `<p class="big">${nextPromotion.days} days <small>to the Promotion Milestone</small></p>
<p class="note">${escape(nextPromotion.milestone)} · ${dateMark(shortDate(nextPromotion.date, view.today))}, for ${escape(nextPromotion.goal)}</p>`
    : `<p class="note small">No Promotion Milestone is due.</p>`;
  return `<section class="cards">
${card("Committed dates", `${slipLine}<p class="counts">${counts}</p><div class="meter">${meter}</div>`)}
${card("Drafts", `<p class="big">${drafts} <small>waiting on an owner</small></p><p class="note small">An agent's Draft takes effect only when a human approves it.</p>`)}
${card("Promotions due", `${promo}<p class="note small">${PROMOTION_MILESTONE}</p>`)}
</section>`;
}

export function homePage(view: PrioritiesView, actor: Actor): string {
  const weeks = view.weeks.map((w) => `<span class="wk" style="left:${pct(w.at)}">${escape(w.label)}</span>`).join("");
  const todayLabel = `<span class="todaylbl" style="left:${pct(view.todayAt)}">Today · ${escape(shortDate(view.today, view.today))}</span>`;
  const backlog = view.backlog.length
    ? view.backlog.map((p) => priorityHtml(view, actor, p)).join("")
    : `<p class="empty">No Priorities below the cut line.</p>`;
  return layout({
    actor,
    org: view.org.name,
    main: `<h1>${escape(view.org.name)}</h1>
${cardsHtml(view)}
<section class="card board">
<div class="head"><h2>Priorities</h2><span class="small">in rank order</span></div>
<div class="scroll"><div class="inner">
<div class="row weeks"><div></div><div class="lane" style="height:40px">${todayLabel}${weeks}</div></div>
${view.funded.map((p) => priorityHtml(view, actor, p)).join("\n")}
<div class="cut">✂ Backlog</div>
${backlog}
</div></div>
<div class="legend">
<span><i class="sw" style="background:var(--yellow)"></i>Before today: health</span>
<span><i class="sw" style="background:var(--yellow-bg)"></i>Committed date or Promotion Milestone, tinted by health</span>
<span><i class="sw Ambition"></i>Ambition date</span>
<span><i class="sw Fantasy"></i>Fantasy date</span>
<span><i class="sw slip"></i>Slip</span>
<p>${PROMOTION_MILESTONE}</p>
</div>
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
