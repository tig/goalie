import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { pathToFileURL } from "node:url";

/** The one Hono application. Domain routes are later issues. */
export function createApp(): Hono {
  const app = new Hono();
  app.get("/health", (c) => c.text("ok"));
  return app;
}

/** Listen with the Node adapter. Callers choose the port. */
export function listen(
  app: Hono,
  port: number,
  hostname: string | undefined = "127.0.0.1",
): ReturnType<typeof serve> {
  return serve({ fetch: app.fetch, hostname, port });
}

function configuredPort(): number {
  const raw = process.env.PORT ?? "3000";
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer from 1 to 65535");
  }
  return port;
}

function startedAsMain(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (startedAsMain()) {
  listen(createApp(), configuredPort(), process.env.HOST);
}
