import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
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

/** The one home of the phone width (review E11). The CSS draws the phone layout under the `phone` class this sets on the root. */
const PHONE_QUERY = "(max-width:760px)";

/** True on a phone. It keeps the root's `phone` class in step. */
export function usePhone(): boolean {
  const phone = useMedia(PHONE_QUERY);
  useLayoutEffect(() => {
    document.documentElement.classList.toggle("phone", phone);
  }, [phone]);
  return phone;
}

/** True while the media query holds. */
function useMedia(query: string): boolean {
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
