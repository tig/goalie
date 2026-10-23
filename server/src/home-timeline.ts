import { dateLabel, escape, look, priorityRows, help, shortDate, type Actor } from "./components.ts";
import type { GoalRow, PrioritiesView } from "./priorities.ts";
import { laneOf, type Lane, type TimelineWindow } from "./timeline.ts";

/** The Priorities view drawn as a timeline: the goal column pinned on the left, one lane per goal, scrolling sideways through the weeks. */

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

function laneHtml(lane: Lane, goal: GoalRow, today: string): string {
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
    parts.push(`<span class="ticklbl" style="${side};color:${tickInk}">${escape(dateLabel(lane.tick.date, today) + slip)}</span>`);
  } else if (lane.tick) {
    parts.push(edge(lane.tick.outside, "", dateLabel(lane.tick.date, today) + slip, tickInk));
  }
  if (lane.end && !lane.end.outside) {
    const side = lane.end.at > 85 ? `right:calc(100% - ${pct(lane.end.at)} - 3px)` : `left:calc(${pct(lane.end.at)} - 3px)`;
    parts.push(`<span class="dot ${lane.end.date.kind}" style="left:${pct(lane.end.at)}"></span>`);
    parts.push(`<span class="endlbl ${lane.end.date.kind}" style="${side}">${escape(dateLabel(lane.end.date, today))}</span>`);
  } else if (lane.end) {
    parts.push(edge(lane.end.outside, lane.end.date.kind, dateLabel(lane.end.date, today)));
  }
  return parts.join("");
}

function legendHtml(committedHelp: string[]): string {
  const item = (swatch: string, label: string, lines?: string[]) => `<span class="lg"><i class="sw ${swatch}"></i>${escape(label)}${lines ? help(label, lines) : ""}</span>`;
  return `<div class="legend">
${item("health", "Health")}
${item("ahead", "Committed date", committedHelp)}
${item("Ambition", "Ambition date")}
${item("Fantasy", "Fantasy date")}
${item("slip", "Slip")}
</div>`;
}

/** `search` sits in the corner above the goal column. `committedHelp` is the legend's help for a Committed date. */
export function timelineHtml(view: PrioritiesView, actor: Actor, window: TimelineWindow, search: string, committedHelp: string[]): string {
  const weeks = window.weeks
    .map((w) => `<span class="wk" style="left:${pct(w.at)}">${escape(shortDate(w.date, view.today))}</span>${w.open ? `<span class="opens" style="left:calc(${pct(w.at)} - var(--left) - var(--gap))" aria-hidden="true"></span>` : ""}`)
    .join("");
  const drawing = {
    actor,
    filtering: Boolean(view.filter.health || view.filter.q),
    ids: true,
    cells: (goal: GoalRow) => `<div class="lane">${laneHtml(laneOf(goal, window, view.today), goal, view.today)}</div>`,
    blank: '<div class="lane"></div>',
  };
  return `<div class="scroll"><div class="tl" style="--weeks:${window.weeks.length};--now:${window.todayAt.toFixed(2)}">
<div class="axis"><div class="corner">${search}</div><div class="ticks"><span class="todaylbl" style="left:${pct(window.todayAt)}">Today</span>${weeks}</div></div>
<div class="tlbody">
${priorityRows(drawing, view.funded, view.backlog)}
</div>
</div></div>
${legendHtml(committedHelp)}`;
}
