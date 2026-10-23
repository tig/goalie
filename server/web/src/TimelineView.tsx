import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { dateLabel, shortDate } from "./model/dates.ts";
import type { GoalRow } from "./model/filter.ts";
import { laneOf, visibleRange, type Lane, type Mark, type TimelineWindow } from "./model/timeline.ts";
import { GoalTree, type TreeProps } from "./GoalTree.tsx";
import { HELP } from "./helpText.tsx";
import { Help, look } from "./parts.tsx";

const pct = (n: number) => `${n.toFixed(3)}%`;

/** A segment. Round only the outer ends of the bar. */
function Seg({ cls, from, to, style, first, last }: { cls: string; from: number; to: number; style?: CSSProperties; first: boolean; last: boolean }) {
  if (to <= from) return null;
  return <span className={`seg ${cls}${first ? " first" : ""}${last ? " last" : ""}`} style={{ left: pct(from), width: pct(to - from), ...style }} />;
}

/** A date past the edge of the window, written at that edge with an arrow. */
const Edge = ({ mark, text, color }: { mark: Mark; text: string; color?: string }) => (
  <span className={`edge ${mark.outside} ${mark.date.kind}`} style={color ? { color } : undefined}>
    {mark.outside === "before" ? `← ${text}` : `${text} →`}
  </span>
);

function LaneMarks({ lane, goal, today }: { lane: Lane; goal: GoalRow; today: string }) {
  const l = look(goal.health);
  const pieces = (["health", "slip", "ahead"] as const).filter((p) => lane[p]);
  const ends = (p: (typeof pieces)[number]) => ({ first: pieces[0] === p, last: pieces[pieces.length - 1] === p });
  const parts: ReactNode[] = [];
  if (lane.health) parts.push(<Seg key="h" cls="health" {...lane.health} style={{ background: l.bar }} {...ends("health")} />);
  if (lane.slip) parts.push(<Seg key="s" cls="slip" {...lane.slip} {...ends("slip")} />);
  if (lane.ahead) parts.push(<Seg key="a" cls="ahead" {...lane.ahead} style={goal.health ? { background: l.bg } : undefined} {...ends("ahead")} />);
  if (lane.line && lane.line.to > lane.line.from) parts.push(<span key="l" className={`line ${lane.line.kind}`} style={{ left: pct(lane.line.from), width: pct(lane.line.to - lane.line.from) }} />);
  const slip = lane.slip ? ` · slip ${lane.slip.days} days` : "";
  const tickInk = lane.slip ? "var(--red-ink)" : "var(--ink)";
  if (lane.tick && !lane.tick.outside) {
    const at = lane.tick.at;
    const side: CSSProperties = at > 70 ? { left: `calc(${pct(at)} - 6px)`, transform: "translateX(-100%)" } : { left: `calc(${pct(at)} + 6px)` };
    parts.push(<span key="t" className="tick" style={{ left: pct(at) }} />);
    parts.push(<span key="tl" className="ticklbl" style={{ ...side, color: tickInk }}>{dateLabel(lane.tick.date, today) + slip}</span>);
  } else if (lane.tick) {
    parts.push(<Edge key="t" mark={lane.tick} text={dateLabel(lane.tick.date, today) + slip} color={tickInk} />);
  }
  if (lane.end && !lane.end.outside) {
    const at = lane.end.at;
    const side: CSSProperties = at > 85 ? { right: `calc(100% - ${pct(at)} - 3px)` } : { left: `calc(${pct(at)} - 3px)` };
    parts.push(<span key="d" className={`dot ${lane.end.date.kind}`} style={{ left: pct(at) }} />);
    parts.push(<span key="dl" className={`endlbl ${lane.end.date.kind}`} style={side}>{dateLabel(lane.end.date, today)}</span>);
  } else if (lane.end) {
    parts.push(<Edge key="d" mark={lane.end} text={dateLabel(lane.end.date, today)} />);
  }
  return <>{parts}</>;
}

/** The legend under the board. */
function Legend() {
  const item = (swatch: string, label: string, help?: ReactNode) => (
    <span className="lg">
      <i className={`sw ${swatch}`} />
      {label}
      {help && <Help label={label}>{help}</Help>}
    </span>
  );
  return (
    <div className="legend">
      {item("health", "Health")}
      {item("ahead", "Committed date", HELP.committedDate)}
      {item("Ambition", "Ambition date")}
      {item("Fantasy", "Fantasy date")}
      {item("slip", "Slip")}
    </div>
  );
}

type Props = Omit<TreeProps, "cells" | "blank"> & {
  window: TimelineWindow;
  search: ReactNode;
  /** Bumped by Today, to scroll back even when the window did not change. */
  home: number;
  /** The days on screen, as the board scrolls. */
  onRange: (range: { first: string; last: string }) => void;
};

/**
 * The Priorities on a timeline. It scrolls sideways into the past and the future with the goal column pinned.
 * It opens scrolled to the window's opening week in every browser: the app sets scrollLeft.
 */
export function TimelineView({ window: w, search, home, onRange, ...tree }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const report = useRef(onRange);
  useLayoutEffect(() => {
    report.current = onRange;
  });
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => {
      const left = el.querySelector(".axis > .corner")?.getBoundingClientRect().width ?? 0;
      report.current(visibleRange(w, el.scrollLeft, el.clientWidth - left));
    };
    el.scrollLeft = w.openPx;
    measure();
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
    };
  }, [w, home]);
  const style = { "--weeks": w.weeks, "--now": w.todayAt.toFixed(3), "--week": `${w.weekPx}px` } as CSSProperties;
  return (
    <>
      <div className="scroll" ref={scroller}>
        <div className={`tl z-${w.zoom}`} style={style}>
          <div className="axis">
            <div className="corner">{search}</div>
            <div className="ticks">
              <span className="todaylbl" style={{ left: pct(w.todayAt) }}>
                Today<span className="td"> · {shortDate(tree.today, tree.today)}</span>
              </span>
              {w.labels.map((l) => (
                <span key={l.at} className="wk" style={{ left: pct(l.at) }}>
                  {l.label}
                </span>
              ))}
            </div>
          </div>
          <div className="tlbody">
            <GoalTree
              {...tree}
              cells={(goal) => (
                <div className="lane">
                  <LaneMarks lane={laneOf(goal, w, tree.today)} goal={goal} today={tree.today} />
                </div>
              )}
              blank={<div className="lane" />}
            />
          </div>
        </div>
      </div>
      <Legend />
    </>
  );
}
