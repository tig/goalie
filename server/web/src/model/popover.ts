/** Where a help card opens so it stays inside the screen (interaction rule 9). Viewport coordinates, for `position: fixed`. */

export type Rect = { left: number; top: number; right: number; bottom: number };

/** The space kept between a help card and the screen edge, and between it and its icon. */
const EDGE = 16;
const GAP = 8;
const WIDTH = 300;

export function placePopover(anchor: Rect, height: number, viewport: { width: number; height: number }): { left: number; top: number; width: number } {
  const width = Math.min(WIDTH, viewport.width - 2 * EDGE);
  const left = Math.max(EDGE, Math.min(anchor.left - GAP, viewport.width - EDGE - width));
  const below = anchor.bottom + GAP;
  const above = anchor.top - GAP - height;
  const top = below + height > viewport.height - EDGE && above >= EDGE ? above : below;
  return { left, top, width };
}
