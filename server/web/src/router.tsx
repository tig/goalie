import { useSyncExternalStore, type ReactNode } from "react";
import { parseRoute, type Route } from "./model/route.ts";

/** Routing in the browser with the History API. Back and Forward walk the pages and Home's query alike. */

const subscribe = (onChange: () => void) => {
  addEventListener("popstate", onChange);
  return () => removeEventListener("popstate", onChange);
};

let home = "";

/** Home's query when it was last drawn, so the back link from a goal returns to the same view (rule G1). */
export const rememberHome = (search: string) => {
  home = search;
};
export const homeSearch = () => home;

/** Open a path in the app with no page load. */
export function navigate(path: string): void {
  history.pushState(null, "", path);
  dispatchEvent(new PopStateEvent("popstate"));
  scrollTo(0, 0);
}

/** The page the URL names. */
export function useRoute(): Route {
  const href = useSyncExternalStore(subscribe, () => location.pathname + location.search);
  const url = new URL(href, location.origin);
  return parseRoute(url.pathname, url.search);
}

/** A link inside the app. A plain click opens the page in place; a click with a modifier key opens it the browser's way. */
export function Link({ to, className, children, ...rest }: { to: string; className?: string; children: ReactNode; "aria-label"?: string; tabIndex?: number }) {
  return (
    <a
      href={to}
      className={className}
      {...rest}
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        e.stopPropagation();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
