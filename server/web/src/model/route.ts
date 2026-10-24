/** The app's pages and their paths. The server answers index.html for every path that is not the API or an asset, so the app routes in the browser. */

export type Route = { page: "home" } | { page: "goal"; key: string } | { page: "new"; parent?: string };

/** The page for a path. A goal key is written upper case. A path the app does not know opens Home. */
export function parseRoute(pathname: string, search = ""): Route {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "goals" || parts.length !== 2) return { page: "home" };
  if (parts[1] === "new") {
    const parent = new URLSearchParams(search).get("parent")?.toUpperCase();
    return parent ? { page: "new", parent } : { page: "new" };
  }
  return { page: "goal", key: decodeURIComponent(parts[1]).toUpperCase() };
}

export const goalPath = (key: string) => `/goals/${encodeURIComponent(key)}`;

export const newGoalPath = (parent?: string) => (parent ? `/goals/new?parent=${encodeURIComponent(parent)}` : "/goals/new");

/** The back link to Home keeps the view's query: its filter, search, zoom, window, and view (rule G1). */
export const backPath = (homeSearch: string) => `/${homeSearch}`;
