import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { configuredIssuers, resolveActor, type Issuer } from "./auth.ts";
import { configuredDatabase, configuredOrgUnit } from "./config.ts";
import { homePage, signInPage } from "./home.ts";
import { prioritiesView } from "./priorities.ts";
import { openStore } from "./store.ts";

/** The one Hono application. GET / is the Priorities view. No request is anonymous (ADR 0005). */
export function createApp(db: DatabaseSync, issuers: Issuer[]): Hono {
  const app = new Hono();
  app.get("/", async (c) => {
    const who = await resolveActor(db, c.req.header(), issuers);
    if (!who.ok) return c.html(signInPage(who.reason), 401);
    const actor = { id: who.actor.id as string, name: who.actor.display_name as string };
    return c.html(homePage(prioritiesView(db, configuredOrgUnit(db), new Date(), c.req.query("from")), actor));
  });
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
  listen(createApp(openStore(configuredDatabase()), configuredIssuers()), configuredPort(), process.env.HOST);
}
