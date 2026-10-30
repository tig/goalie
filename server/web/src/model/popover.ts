/** Where a help card opens so it stays inside the screen (interaction rule 9). Viewport coordinates, for `position: fixed`. */

type Rect = { left: number; top: number; right: number; bottom: number };

/** The space kept between a help card and the screen edge, and between it and its icon. */
const EDGE = 16;
const GAP = 8;
const WIDTH = 300;

/** A help card is 300 px wide, and never wider than the screen less 32 px. */
export const popoverWidth = (viewportWidth: number) => Math.min(WIDTH, viewportWidth - 2 * EDGE);

/**
 * Beside its icon on the right, else beside it on the left, so it never covers what the icon labels (review X10).
 * With no room on either side it opens below, or above when below would leave the screen. It always stays 16 px inside the screen.
 */
export function placePopover(anchor: Rect, height: number, viewport: { width: number; height: number }, avoid: Rect = anchor): { left: number; top: number; width: number } {
  const width = popoverWidth(viewport.width);
  const fitTop = (top: number) => Math.max(EDGE, Math.min(top, viewport.height - EDGE - height));
  if (avoid.right + GAP + width <= viewport.width - EDGE) return { left: avoid.right + GAP, top: fitTop(anchor.top - GAP), width };
  if (avoid.left - GAP - width >= EDGE) return { left: avoid.left - GAP - width, top: fitTop(anchor.top - GAP), width };
  const left = Math.max(EDGE, Math.min(anchor.left - GAP, viewport.width - EDGE - width));
  const below = avoid.bottom + GAP;
  const top = below + height > viewport.height - EDGE && avoid.top - GAP - height >= EDGE ? avoid.top - GAP - height : below;
  return { left, top, width };
}
