import type { Health } from "../../../src/api.ts";
import { isDate } from "../../../src/dates.ts";

/** The screen state lives in the URL query, so a link reopens the same screen. A value that is not valid is ignored. */

export const ZOOM_ORDER = ["weeks", "months", "quarters"] as const;
export type Zoom = (typeof ZOOM_ORDER)[number];

export const VIEWS = ["timeline", "list", "calendar"] as const;
export type View = (typeof VIEWS)[number];

export const HEALTHS = ["RED", "YELLOW", "GREEN"] as const;
export type Filter = { health?: Exclude<Health, null>; q?: string };

export type Screen = Filter & {
  zoom: Zoom;
  /** The day the timeline opens on, or the month the calendar shows. None means today. */
  from?: string;
  view: View;
};

const oneOf = <T extends string>(list: readonly T[], value: string | null): T | undefined => (list as readonly (string | null)[]).includes(value) ? (value as T) : undefined;

export function parseScreen(search: string): Screen {
  const params = new URLSearchParams(search);
  const q = params.get("q")?.trim().slice(0, 100);
  // A year outside 1970 to 9999 does not draw (review Q10).
  const from = params.get("from");
  const inRange = (d: string) => d >= "1970-01-01" && d <= "9999-12-31";
  const health = oneOf(HEALTHS, params.get("health"));
  return {
    ...(health ? { health } : {}),
    ...(q ? { q } : {}),
    zoom: oneOf(ZOOM_ORDER, params.get("zoom")) ?? "weeks",
    ...(isDate(from) && inRange(from) ? { from } : {}),
    view: oneOf(VIEWS, params.get("view")) ?? "timeline",
  };
}

/** The query for a screen, in a fixed order, with defaults left out. */
export function screenQuery(screen: Screen): string {
  const pairs: [string, string | undefined][] = [
    ["health", screen.health],
    ["q", screen.q],
    ["zoom", screen.zoom === "weeks" ? undefined : screen.zoom],
    ["from", screen.from],
    ["view", screen.view === "timeline" ? undefined : screen.view],
  ];
  const query = pairs
    .filter((pair): pair is [string, string] => Boolean(pair[1]))
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
  return query ? `?${query}` : "";
}
