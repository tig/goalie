import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { shortDate } from "../../src/dates.ts";
import type { GoalRow } from "./model/filter.ts";
import { dateLabel, slipLabel } from "./model/labels.ts";
import { arrowStep, dragLeft, isDrag, scrollEdges, wheelToScroll } from "./model/scroll.ts";
import { EDGE_INSET, fitsView, labelWidth, laneOf, openScroll, placeLaneLabels, todayPill, visibleRange, type Lane, type LaneMark, type TimelineWindow } from "./model/timeline.ts";
import { GoalTree, type TreeProps } from "./GoalTree.tsx";
import { HELP } from "./helpText.tsx";
import { Legend, look } from "./parts.tsx";

const pct = (n: number) => `${n.toFixed(3)}%`;

/** The board's px on screen: what the pinned goal column does not cover. */
type View = { left: number; right: number };

/** An axis label sits this far right of its week line. Half the Today pill's width, with its date. */
const AXIS_INSET = 5;
const PILL_HALF = 28;

/** A segment. Round only the outer ends of the bar. */
function Seg({ cls, from, to, style, first, last }: { cls: string; from: number; to: number; style?: CSSProperties; first: boolean; last: boolean }) {
  if (to <= from) return null;
  return <span className={`seg ${cls}${first ? " first" : ""}${last ? " last" : ""}`} style={{ left: pct(from), width: pct(to - from), ...style }} />;
}

/** A label that sits beside its mark: to its right, or to its left. */
function SideLabel({ cls, at, side, color, children }: { cls: string; at: number; side: "left" | "right"; color?: string; children: ReactNode }) {
  const style: CSSProperties = side === "left" ? { left: `calc(${pct(at)} - 6px)`, transform: "translateX(-100%)" } : { left: `calc(${pct(at)} + 6px)` };
  return (
    <span className={cls} style={{ ...style, color }}>
      {children}
    </span>
  );
}

type Labeled = LaneMark & { cls: string; color?: string };

/** One label at an edge of the screen for every mark past it, in date order, with an arrow (rule 23). */
function EdgeLabel({ side, band, marks, view }: { side: "before" | "after"; band: "above" | "below"; marks: Labeled[]; view: View }) {
  if (!marks.length) return null;
  const parts = marks.map((m, i) => (
    <span key={m.key} className={m.cls} style={{ color: m.color }}>
      {i > 0 && " · "}
      {m.text}
    </span>
  ));
  return (
    <span className={`edge ${side} ${band}`} style={{ left: side === "before" ? view.left + EDGE_INSET : view.right - EDGE_INSET }}>
      {side === "before" && "← "}
      {parts}
      {side === "after" && " →"}
    </span>
  );
}

function LaneMarks({ lane, goal, today, view, board }: { lane: Lane; goal: GoalRow; today: string; view: View; board: number }) {
  const l = look(goal.health);
  const pieces = (["health", "slip", "ahead"] as const).filter((p) => lane[p]);
  // A health bar under a slip is the same length, so both round at both ends.
  const ends = (p: (typeof pieces)[number]) => (lane.slip?.over && p !== "ahead" ? { first: true, last: true } : { first: pieces[0] === p, last: pieces[pieces.length - 1] === p });
  const parts: ReactNode[] = [];
  if (lane.health) parts.push(<Seg key="h" cls="health" {...lane.health} style={{ background: l.bar }} {...ends("health")} />);
  if (lane.slip) parts.push(<Seg key="s" cls={`slip${lane.slip.over ? " over" : ""}`} {...lane.slip} {...ends("slip")} />);
  if (lane.ahead) parts.push(<Seg key="a" cls="ahead" {...lane.ahead} style={goal.health ? { background: l.bg } : undefined} {...ends("ahead")} />);
  if (lane.line && lane.line.to > lane.line.from) parts.push(<span key="l" className={`line ${lane.line.kind}`} style={{ left: pct(lane.line.from), width: pct(lane.line.to - lane.line.from) }} />);
  const labeled: Labeled[] = [];
  if (lane.tick) {
    const pm = lane.tick.date.kind === "Promotion Milestone";
    const text = dateLabel(lane.tick.date, today) + (lane.slip ? ` · ${slipLabel(lane.slip.days)}` : "");
    if (!lane.tick.outside) parts.push(<span key="t" className={`tick${pm ? " pm" : ""}`} style={{ left: pct(lane.tick.at) }} />);
    labeled.push({ key: "tick", atPx: (lane.tick.at / 100) * board, text, outside: lane.tick.outside, band: "above", cls: "ticklbl", color: lane.slip ? "var(--red-ink)" : "var(--ink)" });
  }
  if (lane.end) {
    if (!lane.end.outside) parts.push(<span key="d" className={`dot ${lane.end.date.kind}`} style={{ left: pct(lane.end.at) }} />);
    labeled.push({ key: "end", atPx: (lane.end.at / 100) * board, text: dateLabel(lane.end.date, today), outside: lane.end.outside, band: "below", cls: `endlbl ${lane.end.date.kind}` });
  }
  const placed = placeLaneLabels(labeled, view);
  const byKey = (keys: string[], band: "above" | "below") => labeled.filter((m) => keys.includes(m.key) && m.band === band);
  for (const { key, side } of placed.inside) {
    const m = labeled.find((x) => x.key === key) as Labeled;
    parts.push(
      <SideLabel key={`l-${key}`} cls={m.cls} at={(m.atPx / board) * 100} side={side} color={m.color}>
        {m.text}
      </SideLabel>,
    );
  }
  for (const band of ["above", "below"] as const) {
    parts.push(<EdgeLabel key={`eb-${band}`} side="before" band={band} marks={byKey(placed.before, band)} view={view} />);
    parts.push(<EdgeLabel key={`ea-${band}`} side="after" band={band} marks={byKey(placed.after, band)} view={view} />);
  }
  return <>{parts}</>;
}

type Props = Omit<TreeProps, "cells" | "blank"> & {
  window: TimelineWindow;
  /** Bumped by Today, to scroll back even when the window did not change. */
  home: number;
  /** The days on screen, as the board scrolls. */
  onRange: (range: { first: string; last: string }) => void;
};

/**
 * The Priorities on a timeline. It scrolls sideways into the past and the future with the goal column pinned.
 * It opens scrolled to the window's opening week in every browser: the app sets scrollLeft, and sets it again after fonts and layout settle, until the viewer scrolls (review X2).
 * It shows no scrollbar (rule 20c). It scrolls by trackpad, by the wheel, by dragging the lanes, and by the arrow keys; an edge fades where there is more.
 */
export function TimelineView({ window: w, home, onRange, ...tree }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const report = useRef(onRange);
  const board = w.weeks * w.weekPx;
  const [edges, setEdges] = useState({ before: false, after: false });
  const [view, setView] = useState<View>({ left: w.openPx, right: w.openPx + 13 * w.weekPx });
  const [dragging, setDragging] = useState(false);
  useLayoutEffect(() => {
    report.current = onRange;
  });
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => {
      const left = el.querySelector(".axis > .corner")?.getBoundingClientRect().width ?? 0;
      const width = el.clientWidth - left;
      report.current(visibleRange(w, el.scrollLeft, width));
      setView((v) => (v.left === el.scrollLeft && v.right === el.scrollLeft + width ? v : { left: el.scrollLeft, right: el.scrollLeft + width }));
      const next = scrollEdges(el.scrollLeft, el.scrollWidth, el.clientWidth);
      setEdges((e) => (e.before === next.before && e.after === next.after ? e : next));
    };
    // Until the viewer scrolls, a late layout change (fonts, a restored scroll position) puts the board back on its opening week.
    let touched = false;
    const open = () => {
      if (touched) return;
      const left = el.querySelector(".axis > .corner")?.getBoundingClientRect().width ?? 0;
      el.scrollLeft = openScroll(w.openPx, (w.todayAt / 100) * board, el.clientWidth - left, el.scrollWidth, el.clientWidth);
      measure();
    };
    const touch = () => {
      touched = true;
    };
    open();
    let frame = requestAnimationFrame(open);
    document.fonts?.ready.then(open);
    addEventListener("load", open);
    const resized = new ResizeObserver(() => (touched ? measure() : open()));
    resized.observe(el);
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const onWheel = (e: WheelEvent) => {
      // Over the pinned goal column a plain wheel scrolls the page.
      if (!e.shiftKey && (e.target as Element).closest(".left, .corner")) return;
      const delta = wheelToScroll(e, el.scrollLeft, el.scrollWidth - el.clientWidth);
      if (delta === null) return;
      touch();
      e.preventDefault();
      el.scrollLeft += delta;
    };
    const onKey = (e: KeyboardEvent) => {
      const delta = arrowStep(e.key, w.weekPx);
      if (delta === null || e.target !== el) return;
      touch();
      e.preventDefault();
      el.scrollBy({ left: delta, behavior: "smooth" });
    };
    // A press on the lanes that moves past 4 px pans the board, and the click it ends with does not open or close a goal.
    let press: { x: number; left: number; id: number; moved: boolean } | undefined;
    const onDown = (e: PointerEvent) => {
      touch();
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
    el.addEventListener("touchstart", touch, { passive: true });
    el.addEventListener("keydown", onKey);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    addEventListener("resize", onScroll);
    return () => {
      touched = true;
      cancelAnimationFrame(frame);
      resized.disconnect();
      removeEventListener("load", open);
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", touch);
      el.removeEventListener("keydown", onKey);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      removeEventListener("resize", onScroll);
    };
  }, [w, home, board]);
  // The Today pill is held inside the screen by half its width (review: Timeline labels).
  const pill = todayPill((w.todayAt / 100) * board, PILL_HALF, view);
  const style = { "--weeks": w.weeks, "--now": w.todayAt.toFixed(3), "--week": `${w.weekPx}px` } as CSSProperties;
  return (
    <>
      <div className={`tlwrap${edges.before ? " more-before" : ""}${edges.after ? " more-after" : ""}`}>
        <div className={`scroll${dragging ? " dragging" : ""}`} ref={scroller} tabIndex={0} aria-label="Timeline">
          <div className={`tl z-${w.zoom}`} style={style}>
            <div className="axis">
              {/* The goal column's titles, on the line of the week labels (rule 25d). */}
              <div className="corner colhead">
                <span>Priority</span>
                <span>Owner</span>
              </div>
              <div className="ticks">
                {pill !== null && (
                  <span className="todaylbl" style={{ left: pill }}>
                    Today<span className="td"> · {shortDate(tree.today, tree.today)}</span>
                  </span>
                )}
                {/* An axis label shows only when it fits whole on screen. */}
                {w.labels.map((l) => (
                  <span key={l.at} className={`wk${fitsView((l.at / 100) * board, labelWidth(l.label) + AXIS_INSET, view) ? "" : " off"}`} style={{ left: pct(l.at) }}>
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
                    <LaneMarks lane={laneOf(goal, w, tree.today)} goal={goal} today={tree.today} view={view} board={board} />
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
      <Legend kind="timeline" help={{ "Committed date": HELP.committedDate }} />
    </>
  );
}
