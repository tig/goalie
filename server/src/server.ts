import { serve } from "@hono/node-server";
import { Hono } from "hono";

/** The one Hono application. Domain routes are later issues. */
export function createApp(): Hono {
  return new Hono();
}

/** Listen with the Node adapter. Callers choose the port. */
export function listen(app: Hono, port: number): ReturnType<typeof serve> {
  return serve({ fetch: app.fetch, port });
}
