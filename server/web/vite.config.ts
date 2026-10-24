import { existsSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { BRAND_SLOT, brandHead } from "../src/brand.ts";

/**
 * The React app (ADR 0010). `vite build` writes web/dist, which the Node server serves.
 * In development /api goes to GOALIE_API when it is set, else to the fixtures, so the app runs with no server.
 * With GOALIE_API, a route the server does not have yet ("no API route") falls back to its fixture, so a screen can be built before its route lands.
 * The server refuses a request with no verified actor, so a forwarded request carries GOALIE_TOKEN as its bearer token.
 */

const fixtures = fileURLToPath(new URL("fixtures/", import.meta.url));
const api = process.env.GOALIE_API;
const token = process.env.GOALIE_TOKEN;

/** The fixture for an API path (docs/engineering/goal-page-and-create.md, F0), or undefined. */
function fixtureFor(path: string): string | undefined {
  const route = path.split("?")[0];
  const goal = /^\/api\/goals\/([A-Z]+-\d+)$/.exec(decodeURIComponent(route));
  const file = goal ? `goal-${goal[1]}.json` : { "/api/priorities": "priorities.json", "/api/options": "options.json", "/api/work": "work.json", "/api/commands": "commands-ok.json" }[route];
  return file && existsSync(`${fixtures}${file}`) ? file : undefined;
}

function send(res: ServerResponse, status: number, body: string | Buffer, type = "application/json") {
  res.statusCode = status;
  res.setHeader("content-type", type);
  res.end(body);
}

async function readBody(req: IncomingMessage): Promise<Buffer | undefined> {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  const parts: Buffer[] = [];
  for await (const part of req) parts.push(part as Buffer);
  return Buffer.concat(parts);
}

/** Answers /api from the server at GOALIE_API, else from the fixtures. A goal with no fixture answers 404, as the API does. */
const servesApi: Plugin = {
  name: "goalie-api",
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const url = req.url ?? "";
      if (!url.startsWith("/api/")) return next();
      const fixture = fixtureFor(url);
      if (api) {
        const reply = await fetch(`${api}${url}`, {
          method: req.method,
          headers: { "content-type": req.headers["content-type"] ?? "application/json", accept: "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
          body: await readBody(req),
        }).catch(() => undefined);
        const text = reply ? await reply.text() : "";
        const missing = !reply || (reply.status === 404 && text.includes("no API route"));
        if (!missing || !fixture) return send(res, reply?.status ?? 502, text, reply?.headers.get("content-type") ?? "application/json");
      }
      if (fixture) return send(res, 200, readFileSync(`${fixtures}${fixture}`));
      send(res, 404, JSON.stringify({ error: "not_found", reason: `no fixture for ${url}` }));
    });
  },
};

/** In development no server writes the brand into index.html, so Vite does (review E4). The built page keeps the slot for the server. */
const writesBrand: Plugin = {
  name: "goalie-brand",
  apply: "serve",
  transformIndexHtml: (html) => html.replace(BRAND_SLOT, brandHead()),
};

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react(), writesBrand, servesApi],
  base: "/",
  build: { outDir: "dist", assetsDir: "assets", emptyOutDir: true },
});
