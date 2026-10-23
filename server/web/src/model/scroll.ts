/** How the timeline scrolls with no visible scrollbar: the wheel, the arrows, a drag, and the edge fades. */

/** A wheel delta in lines is this many px. */
const LINE = 16;
/** A press moves this far before it is a drag and not a click. */
const DRAG = 4;

export type Wheel = { deltaX: number; deltaY: number; deltaMode: number; shiftKey: boolean };

/**
 * How far a wheel turn scrolls the timeline sideways, or null to leave it to the browser.
 * A sideways swipe is the browser's. A vertical wheel, or shift and a wheel, scrolls sideways until the timeline reaches its edge; then the page scrolls.
 */
export function wheelToScroll(wheel: Wheel, left: number, maxLeft: number): number | null {
  if (!wheel.shiftKey && Math.abs(wheel.deltaX) >= Math.abs(wheel.deltaY)) return null;
  const delta = (wheel.shiftKey && wheel.deltaY === 0 ? wheel.deltaX : wheel.deltaY) * (wheel.deltaMode === 1 ? LINE : 1);
  if ((delta < 0 && left <= 0) || (delta > 0 && left >= maxLeft)) return null;
  return delta;
}

/** Left and Right arrows move one week. */
export function arrowStep(key: string, weekPx: number): number | null {
  return key === "ArrowLeft" ? -weekPx : key === "ArrowRight" ? weekPx : null;
}

/** Whether there is more to scroll before or after what is on screen. Half a px is no more. */
export function scrollEdges(left: number, width: number, clientWidth: number): { before: boolean; after: boolean } {
  return { before: left > 0.5, after: left + clientWidth < width - 0.5 };
}

export const isDrag = (dx: number) => Math.abs(dx) > DRAG;

/** The scroll position while a drag that started at `startX` with the board at `startLeft` is at `x`. */
export const dragLeft = (startLeft: number, startX: number, x: number) => startLeft - (x - startX);
