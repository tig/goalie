import { shortDate, type GoalRow, type Health, type Lane, type PrioritiesView, type PriorityRow } from "./priorities.ts";

/**
 * Pages built on the server (ADR 0010). No browser script beyond the shared chrome.
 * Host configuration serves the shared chrome at /_xw/. chrome.js adds the navbar and the footer.
 * The look is the v1 canvas Home board. Colors are tokens on :root so an organization can reskin them.
 */

const HEAD = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Goalie</title>
<link rel="icon" type="image/svg+xml" href="/_xw/brand/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/_xw/brand/favicon-32.png">
<link rel="stylesheet" href="/_xw/chrome.css">
<script src="/_xw/chrome.js" defer></script>
<meta name="xw-app" content="Goalie">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&amp;display=swap">`;

const STYLE = `<style>
:root{--ground:#f3f8f4;--card:#ffffff;--ink:#2f3a33;--mute:#5f6b64;--line:#edf2ee;--grid:#eef3ef;--brand:#bfe6cc;--brand-ink:#17482f;--today:#2f9a5f;
--red-bg:#fbd9dd;--red-ink:#9c2a3c;--red:#e5677a;--yellow-bg:#fbefc6;--yellow-ink:#755800;--yellow:#e8c766;--green-bg:#d3f0e2;--green-ink:#1e6544;--green:#5cbf85;--none-bg:#eef2ef;--none:#b4beb7;
--ahead:#e6ece8;--ambition:#8fadd9;--ambition-line:#b7c9e6;--ambition-ink:#2c5796;--fantasy:#a99ce0;--fantasy-line:#cfc6ee;--fantasy-ink:#6e5fb5;--slip-a:#f6b8c0;--slip-b:#fdeef0;
--radius:18px;--font:"Figtree",system-ui,sans-serif}
body{margin:0;background:var(--ground);color:var(--ink);font:14px/1.4 var(--font)}
a{color:#1e6b45}
.top{position:sticky;top:0;z-index:50;display:flex;align-items:center;gap:14px;padding:14px 32px;background:var(--card);border-bottom:1px solid var(--line)}
.logo{width:34px;height:34px;border-radius:11px;background:var(--brand);color:var(--brand-ink);display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:16px}
.brand{font-weight:800;font-size:18px}.org{color:var(--mute)}
.tab{height:34px;padding:0 16px;border-radius:999px;background:var(--brand);color:var(--brand-ink);font-weight:700;display:inline-flex;align-items:center;margin-left:16px}
.me{margin-left:auto}
.av{width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:10px;flex:none;background:#e3dafb;color:#4a3a91}
.av.chelsea{background:#fadbe7;color:#9a2f5a}.me .av{width:30px;height:30px;font-size:12px}
main{max-width:1312px;margin:0 auto;padding:28px 32px 48px;box-sizing:border-box}
h1{font-size:26px;font-weight:800;margin:0 0 20px}
.cards{display:grid;grid-template-columns:1.6fr 1fr 1fr;gap:16px;margin-bottom:16px}
.card{background:var(--card);border-radius:var(--radius);box-shadow:0 1px 2px rgba(47,58,51,.05),0 4px 16px rgba(47,58,51,.05);padding:18px 20px;min-width:0}
.lbl{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--mute);margin:0 0 8px}
.big{font-size:22px;font-weight:800;margin:0 0 8px;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}.big small{font-size:14px;font-weight:700;color:var(--green-ink)}
.meter{display:flex;gap:3px;margin:0 0 10px}.meter span{flex:1;height:8px;border-radius:999px}
.note{font-size:13px;margin:0}.small{font-size:12px;color:var(--mute)}
.late{color:var(--red-ink);font-weight:700}
.board{padding:20px 20px 16px}
.board h2{font-size:15px;font-weight:800;margin:0}
.head{display:flex;align-items:baseline;gap:10px;margin:0 0 6px 30px}
.scroll{overflow-x:auto}.inner{min-width:980px}
.row{display:grid;grid-template-columns:380px minmax(0,1fr);column-gap:8px;align-items:center;border-top:1px solid var(--line)}
.row.weeks{border-top:0;height:40px;align-items:end}
.left{display:flex;align-items:center;gap:12px;padding:10px 0;min-width:0}
.rank{width:30px;height:30px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;font-weight:800;flex:none}
.title{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.meta{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--mute);margin-top:3px}
.chip{display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:999px;font-size:11px;font-weight:800}
.lane{position:relative;height:64px;overflow:hidden}
.sub .lane{height:48px}.sub .left{padding:6px 0}.sub .title{font-weight:600}
.gl{position:absolute;top:0;bottom:0;width:1px;background:var(--grid)}
.today{position:absolute;top:0;bottom:0;width:2px;background:var(--today);z-index:4}
.wk{position:absolute;bottom:6px;margin-left:5px;font-size:12px;font-weight:600;color:var(--mute);white-space:nowrap}
.todaylbl{position:absolute;top:0;transform:translateX(-50%);background:var(--today);color:#fff;font-size:11px;font-weight:800;padding:2px 8px;border-radius:999px;white-space:nowrap}
.seg{position:absolute;top:50%;height:22px;margin-top:-11px}.sub .seg{height:14px;margin-top:-7px}
.seg.first{border-radius:999px 0 0 999px}.seg.last{border-radius:0 999px 999px 0}.seg.first.last{border-radius:999px}
.ahead{background:var(--ahead)}
.slip{background:repeating-linear-gradient(135deg,var(--slip-a) 0 6px,var(--slip-b) 6px 12px)}
.tick{position:absolute;top:50%;width:3px;height:30px;margin:-15px 0 0 -1.5px;border-radius:2px;background:var(--ink);z-index:3}.sub .tick{height:20px;margin-top:-10px}
.ticklbl{position:absolute;top:3px;font-size:11px;font-weight:800;white-space:nowrap;z-index:3}
.line{position:absolute;top:50%;height:0;margin-top:-1px;z-index:1;border-top:2px solid var(--ambition-line)}
.line.Fantasy{border-top:2px dotted var(--fantasy-line)}
.dot{position:absolute;top:50%;width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;z-index:2;background:var(--ambition);box-shadow:0 0 0 1.5px #fff}
.dot.Fantasy{background:#fff;box-shadow:inset 0 0 0 1.5px var(--fantasy),0 0 0 1.5px #fff}
.endlbl{position:absolute;top:calc(50% + 10px);font-size:10px;font-weight:600;white-space:nowrap;color:#7d8a82}
.edge{position:absolute;right:6px;top:50%;transform:translateY(-50%);font-size:12px;font-weight:700;z-index:3;background:var(--card);padding:0 4px}
.edge.Ambition{color:var(--ambition-ink)}.edge.Fantasy{color:var(--fantasy-ink)}
details>summary{list-style:none;cursor:pointer}details>summary::-webkit-details-marker{display:none}
.chev{width:26px;height:26px;border-radius:50%;background:#f0f5f1;color:var(--ink);display:inline-flex;align-items:center;justify-content:center;flex:none;margin-left:auto;margin-right:8px;transition:transform .15s}
details[open]>summary .chev{transform:rotate(180deg)}
.kids{background:#fafcfb}
.cut{display:flex;align-items:center;gap:10px;margin:6px 0;color:var(--mute);font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
.cut::before,.cut::after{content:"";flex:1;border-top:1.5px dashed #c9d3cc}
.empty{padding:12px 0 4px 42px;color:var(--mute);font-size:13px}
.legend{display:flex;flex-wrap:wrap;gap:18px;justify-content:flex-end;margin-top:14px;font-size:12px;color:var(--mute)}
.legend span{display:inline-flex;align-items:center;gap:7px}
.sw{display:inline-block;width:28px;height:10px;border-radius:999px}
.signin{max-width:32rem;margin:15vh auto;text-align:center}
.when{display:none;font-size:12px;color:var(--mute);margin-top:3px}
@media (max-width:760px){.top{padding:12px 16px}main{padding:20px 16px 40px}.cards{grid-template-columns:1fr}.tab{margin-left:4px}
.inner{min-width:0}.row{grid-template-columns:minmax(0,1fr)}.lane,.row.weeks{display:none}.when{display:block}.head{margin-left:0}.legend{display:none}.left{padding-right:4px}}
</style>`;

const HEALTH: Record<string, { bg: string; ink: string; bar: string }> = {
  GREEN: { bg: "var(--green-bg)", ink: "var(--green-ink)", bar: "var(--green)" },
  YELLOW: { bg: "var(--yellow-bg)", ink: "var(--yellow-ink)", bar: "var(--yellow)" },
  RED: { bg: "var(--red-bg)", ink: "var(--red-ink)", bar: "var(--red)" },
  none: { bg: "var(--none-bg)", ink: "var(--mute)", bar: "var(--none)" },
};

const look = (health: Health) => HEALTH[health ?? "none"];

export function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const pct = (n: number) => `${n.toFixed(2)}%`;

function avatar(row: { owner: string; ownerName: string }): string {
  return `<span class="av ${escape(row.owner)}" title="${escape(row.ownerName)}">${escape(row.ownerName.slice(0, 1))}</span>`;
}

function grid(view: PrioritiesView): string {
  return view.weeks.map((w) => `<span class="gl" style="left:${pct(w.at)}"></span>`).join("") + `<span class="today" style="left:${pct(view.todayAt)}"></span>`;
}

/** A segment span. Round only the outer ends of the bar. */
function seg(cls: string, from: number, to: number, style = "", first = false, last = false): string {
  if (to <= from) return "";
  const ends = `${first ? " first" : ""}${last ? " last" : ""}`;
  return `<span class="seg ${cls}${ends}" style="left:${pct(from)};width:${pct(to - from)};${style}"></span>`;
}

function laneHtml(lane: Lane, health: Health): string {
  const parts: string[] = [];
  const pieces = [lane.health && "health", lane.slip && "slip", lane.ahead && "ahead"].filter(Boolean);
  const first = pieces[0];
  const last = pieces[pieces.length - 1];
  if (lane.health) parts.push(seg("health", lane.health.from, lane.health.to, `background:${look(health).bar}`, first === "health", last === "health"));
  if (lane.slip) parts.push(seg("slip", lane.slip.from, lane.slip.to, "", first === "slip", last === "slip"));
  if (lane.ahead) parts.push(seg("ahead", lane.ahead.from, lane.ahead.to, "", first === "ahead", last === "ahead"));
  if (lane.line && lane.line.to > lane.line.from) {
    parts.push(`<span class="line ${lane.line.kind}" style="left:${pct(lane.line.from)};width:${pct(lane.line.to - lane.line.from)}"></span>`);
  }
  if (lane.tick && !lane.tick.outside) {
    const slip = lane.slip ? ` · slip ${lane.slip.days} days` : "";
    const side = lane.tick.at > 70 ? `left:calc(${pct(lane.tick.at)} - 6px);transform:translateX(-100%)` : `left:calc(${pct(lane.tick.at)} + 6px)`;
    parts.push(`<span class="tick" style="left:${pct(lane.tick.at)}"></span>`);
    parts.push(`<span class="ticklbl" style="${side};color:${lane.slip ? "var(--red-ink)" : "var(--ink)"}">${escape(lane.tick.label + slip)}</span>`);
  } else if (lane.tick) {
    parts.push(`<span class="edge">${escape(lane.tick.label)} →</span>`);
  }
  if (lane.end && !lane.end.outside) {
    const side = lane.end.at > 85 ? `right:calc(100% - ${pct(lane.end.at)} - 3px)` : `left:calc(${pct(lane.end.at)} - 3px)`;
    parts.push(`<span class="dot ${lane.end.kind}" style="left:${pct(lane.end.at)}"></span>`);
    parts.push(`<span class="endlbl" style="${side}">${escape(lane.end.label)}</span>`);
  } else if (lane.end) {
    parts.push(`<span class="edge ${lane.end.kind}">${escape(lane.end.label)} →</span>`);
  }
  return parts.join("");
}

function healthChip(health: Health, state: string): string {
  const l = look(health);
  return `<span class="chip" style="background:${l.bg};color:${l.ink}">${escape(health ?? state)}</span>`;
}

function goalHtml(view: PrioritiesView, goal: GoalRow, rank?: number): string {
  const l = look(goal.health);
  const badge =
    rank === undefined
      ? ""
      : `<span class="rank" style="background:${l.bg};color:${l.ink};box-shadow:inset 0 0 0 1.5px ${l.bar}">${rank}</span>`;
  const indent = goal.depth > 0 ? `style="padding-left:${42 + (goal.depth - 1) * 22}px"` : "";
  const kids = goal.children.length;
  const left = `<div class="left" ${indent}>${badge}<div style="min-width:0"><div class="title">${escape(goal.summary)}</div>
<div class="meta">${avatar(goal)}<span>${escape(goal.id)}</span>${healthChip(goal.health, goal.state)}${kids ? `<span>${kids} sub-goal${kids === 1 ? "" : "s"}</span>` : ""}</div>${goal.when ? `<div class="when">${escape(goal.when)}</div>` : ""}</div>${kids ? '<span class="chev" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5 6 7.5 9 4.5"/></svg></span>' : ""}</div>`;
  const row = `<div class="row${goal.depth > 0 ? " sub" : ""}" id="goal-${escape(goal.id)}" data-health="${goal.health ?? ""}">${left}<div class="lane">${grid(view)}${laneHtml(goal.lane, goal.health)}</div></div>`;
  if (!kids) return row;
  return `<details open><summary>${row}</summary><div class="kids">${goal.children.map((c) => goalHtml(view, c)).join("")}</div></details>`;
}

function priorityHtml(view: PrioritiesView, priority: PriorityRow): string {
  if (priority.goals.length === 0) {
    return `<div class="row" id="priority-${escape(priority.id)}"><div class="left"><span class="rank" style="background:var(--none-bg)">${priority.rank}</span><div class="title">${escape(priority.title)}</div></div><div class="lane">${grid(view)}</div></div>`;
  }
  return priority.goals.map((g, i) => goalHtml(view, g, i === 0 ? priority.rank : undefined)).join("");
}

function cardsHtml(view: PrioritiesView): string {
  const { committed, drafts, nextPromotion } = view.summary;
  const meter = committed.healths.map((h) => `<span style="background:${look(h).bar}"></span>`).join("");
  const slip = committed.slips[0];
  const slipLine = slip
    ? `<p class="note"><span class="late">●</span> ${escape(slip.id)} ${escape(slip.summary)}: <span class="late">slip ${slip.days} days</span> past ${escape(slip.date)}</p>`
    : `<p class="note small">No slips.</p>`;
  const promo = nextPromotion
    ? `<p class="big">${nextPromotion.days} days <small style="color:var(--ink)">to the Promotion Milestone</small></p>
<p class="note">${escape(nextPromotion.milestone)} · ${escape(shortDate(nextPromotion.date, view.today))}, for ${escape(nextPromotion.goal)}</p>`
    : `<p class="note small">No Promotion Milestone is due.</p>`;
  return `<section class="cards">
<div class="card"><p class="lbl">Committed dates</p><p class="big">${committed.green} of ${committed.total} <small>GREEN</small></p><div class="meter">${meter}</div>${slipLine}</div>
<div class="card"><p class="lbl">Drafts</p><p class="big">${drafts} <small style="color:var(--ink)">waiting on an owner</small></p><p class="note small">An agent's Draft takes effect only when a human approves it.</p></div>
<div class="card"><p class="lbl">Promotions due</p>${promo}</div>
</section>`;
}

function topBar(actor?: { id: string; name: string }): string {
  const me = actor ? `<span class="me">${avatar({ owner: actor.id, ownerName: actor.name })}</span>` : "";
  return `<header class="top"><span class="logo">G</span><span class="brand">Goalie</span><span class="org">/ Excaliwire</span><span class="tab">Home</span>${me}</header>`;
}

export function homePage(view: PrioritiesView, actor: { id: string; name: string }): string {
  const weeks = view.weeks.map((w) => `<span class="wk" style="left:${pct(w.at)}">${escape(w.label)}</span>`).join("");
  const todayLabel = `<span class="todaylbl" style="left:${pct(view.todayAt)}">Today · ${escape(shortDate(view.today, view.today))}</span>`;
  const backlog = view.backlog.length
    ? view.backlog.map((p) => priorityHtml(view, p)).join("")
    : `<p class="empty">No Priorities below the cut line.</p>`;
  return `<!doctype html>
<html lang="en">
<head>
${HEAD}
${STYLE}
</head>
<body>
${topBar(actor)}
<main>
<h1>Company goals</h1>
${cardsHtml(view)}
<section class="card board">
<div class="head"><h2>Priorities</h2><span class="small">${escape(view.org)} · in rank order</span></div>
<div class="scroll"><div class="inner">
<div class="row weeks"><div></div><div class="lane" style="height:40px">${todayLabel}${weeks}</div></div>
${view.funded.map((p) => priorityHtml(view, p)).join("\n")}
<div class="cut">✂ Backlog</div>
${backlog}
</div></div>
<div class="legend">
<span><i class="sw" style="background:var(--yellow)"></i>Before today: health</span>
<span><i class="sw ahead"></i>Committed date or Promotion Milestone</span>
<span><i class="sw" style="height:2px;background:var(--ambition-line)"></i>Ambition date</span>
<span><i class="sw" style="height:0;border-top:2px dotted var(--fantasy-line)"></i>Fantasy date</span>
<span><i class="sw slip"></i>Slip</span>
</div>
</section>
</main>
</body>
</html>
`;
}

export function signInPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
${HEAD}
${STYLE}
</head>
<body>
${topBar()}
<main class="signin">
<h1>Sign in to Goalie</h1>
<p>Goalie shows goals only to a signed-in actor.</p>
</main>
</body>
</html>
`;
}
