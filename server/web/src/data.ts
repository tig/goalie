import { useCallback, useEffect, useState } from "react";
import type { ApiError } from "../../src/api.ts";

/** Reading the API. Every read is one GET with the actor's session; the server holds the rules. */

export type Loaded<T> = { state: "loading" } | { state: "ok"; data: T } | { state: "refused"; status: number; reason: string };

export async function getJson<T>(url: string): Promise<Loaded<T>> {
  try {
    const reply = await fetch(url, { headers: { accept: "application/json" } });
    if (reply.ok) return { state: "ok", data: (await reply.json()) as T };
    const error = (await reply.json().catch(() => ({ reason: reply.statusText }))) as Partial<ApiError>;
    return { state: "refused", status: reply.status, reason: error.reason ?? reply.statusText };
  } catch (e) {
    return { state: "refused", status: 0, reason: (e as Error).message };
  }
}

/** One resource, loaded when the URL changes. `reload` reads it again, as after every save. */
export function useJson<T>(url: string): [Loaded<T>, () => void] {
  const [loaded, setLoaded] = useState<Loaded<T>>({ state: "loading" });
  const [round, setRound] = useState(0);
  const [seen, setSeen] = useState(url);
  if (seen !== url) {
    setSeen(url);
    setLoaded({ state: "loading" });
  }
  useEffect(() => {
    let live = true;
    getJson<T>(url).then((result) => live && setLoaded(result));
    return () => {
      live = false;
    };
  }, [url, round]);
  const reload = useCallback(() => setRound((n) => n + 1), []);
  return [loaded, reload];
}
