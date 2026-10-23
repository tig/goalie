import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { dateLabel, shortDate } from "./model/dates.ts";
import type { GoalRow } from "./model/filter.ts";
import { arrowStep, dragLeft, isDrag, scrollEdges, wheelToScroll } from "./model/scroll.ts";
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
 * It shows no scrollbar (rule 20c). It scrolls by trackpad, by the wheel, by dragging the lanes, and by the arrow keys; an edge fades where there is more.
 */
export function TimelineView({ window: w, search, home, onRange, ...tree }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const report = useRef(onRange);
  const [edges, setEdges] = useState({ before: false, after: false });
  const [dragging, setDragging] = useState(false);
  useLayoutEffect(() => {
    report.current = onRange;
  });
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => {
      const left = el.querySelector(".axis > .corner")?.getBoundingClientRect().width ?? 0;
      report.current(visibleRange(w, el.scrollLeft, el.clientWidth - left));
      const next = scrollEdges(el.scrollLeft, el.scrollWidth, el.clientWidth);
      setEdges((e) => (e.before === next.before && e.after === next.after ? e : next));
    };
    el.scrollLeft = w.openPx;
    measure();
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const onWheel = (e: WheelEvent) => {
      // Over the pinned goal column a plain wheel scrolls the page.
      if (!e.shiftKey && (e.target as Element).closest(".left, .corner")) return;
      const delta = wheelToScroll(e, el.scrollLeft, el.scrollWidth - el.clientWidth);
      if (delta === null) return;
      e.preventDefault();
      el.scrollLeft += delta;
    };
    const onKey = (e: KeyboardEvent) => {
      const delta = arrowStep(e.key, w.weekPx);
      if (delta === null || e.target !== el) return;
      e.preventDefault();
      el.scrollBy({ left: delta, behavior: "smooth" });
    };
    // A press on the lanes that moves past 4 px pans the board, and the click it ends with does not open or close a goal.
    let press: { x: number; left: number; id: number; moved: boolean } | undefined;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || e.pointerType !== "mouse" || (e.target as Element).closest(".left, .corner")) return;
      press = { x: e.clientX, left: el.scrollLeft, id: e.pointerId, moved: false };
    };
    const onMove = (e: PointerEvent) => {
      if (!press || e.pointerId !== press.id) return;
      if (!press.moved && !isDrag(e.clientX - press.x)) return;
      if (!press.moved) {
        press.moved = true;
        el.setPointerCapture(press.id);
        setDragging(true);
      }
      el.scrollLeft = dragLeft(press.left, press.x, e.clientX);
    };
    const onUp = (e: PointerEvent) => {
      if (!press || e.pointerId !== press.id) return;
      if (press.moved) {
        const swallow = (c: Event) => {
          c.stopPropagation();
          c.preventDefault();
        };
        el.addEventListener("click", swallow, { capture: true, once: true });
        setTimeout(() => el.removeEventListener("click", swallow, { capture: true }), 0);
        setDragging(false);
      }
      press = undefined;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("keydown", onKey);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("keydown", onKey);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      removeEventListener("resize", onScroll);
    };
  }, [w, home]);
  const style = { "--weeks": w.weeks, "--now": w.todayAt.toFixed(3), "--week": `${w.weekPx}px` } as CSSProperties;
  return (
    <>
      <div className={`tlwrap${edges.before ? " more-before" : ""}${edges.after ? " more-after" : ""}`}>
        <div className={`scroll${dragging ? " dragging" : ""}`} ref={scroller} tabIndex={0} aria-label="Timeline">
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
        <span className="fade before" aria-hidden="true" />
        <span className="fade after" aria-hidden="true" />
      </div>
      <Legend />
    </>
  );
}
