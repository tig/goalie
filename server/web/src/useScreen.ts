import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { parseScreen, screenQuery, type Screen } from "./model/query.ts";

/** The screen state, read from and written to the URL query. Back and Forward walk it. */
export function useScreen(): [Screen, (change: Partial<Screen>, replace?: boolean) => void] {
  const [screen, setScreen] = useState(() => parseScreen(location.search));
  const latest = useRef(screen);
  useEffect(() => {
    const onPop = () => {
      latest.current = parseScreen(location.search);
      setScreen(latest.current);
    };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);
  const change = useCallback((values: Partial<Screen>, replace = false) => {
    const next = parseScreen(screenQuery({ ...latest.current, ...values }));
    const url = `${location.pathname}${screenQuery(next)}`;
    if (replace) history.replaceState(null, "", url);
    else history.pushState(null, "", url);
    latest.current = next;
    setScreen(next);
  }, []);
  return [screen, change];
}

/** True while the media query holds. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => matchMedia(query).matches,
  );
}

/** Call `close` on Escape or on a press outside every element in `inside`. */
export function useDismiss(open: boolean, inside: React.RefObject<HTMLElement | null>[], close: () => void): void {
  const within = useRef(inside);
  useEffect(() => {
    within.current = inside;
  });
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!within.current.some((r) => r.current?.contains(e.target as Node))) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
}
