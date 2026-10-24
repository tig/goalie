import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { BRAND_SLOT, brandHead } from "../src/brand.ts";

/**
 * The React app (ADR 0010). `vite build` writes web/dist, which the Node server serves.
 * In development /api goes to GOALIE_API when it is set, else to the seed fixture, so the app runs with no server.
 * The server refuses a request with no verified actor, so a proxied request carries GOALIE_TOKEN as its bearer token.
 */

const fixtures = fileURLToPath(new URL("fixtures/", import.meta.url));

/** The fixtures at the route paths (docs/engineering/goal-page-and-create.md, F0). A goal with no fixture answers 404, as the API does. */
const servesFixture: Plugin = {
  name: "goalie-fixture",
  configureServer(server) {
    const send = (res: import("node:http").ServerResponse, status: number, file: string | object) => {
      res.statusCode = status;
      res.setHeader("content-type", "application/json");
      res.end(typeof file === "string" ? readFileSync(`${fixtures}${file}`) : JSON.stringify(file));
    };
    server.middlewares.use("/api/priorities", (_req, res) => send(res, 200, "priorities.json"));
    server.middlewares.use("/api/options", (_req, res) => send(res, 200, "options.json"));
    server.middlewares.use("/api/work", (_req, res) => send(res, 200, "work.json"));
    server.middlewares.use("/api/commands", (_req, res) => send(res, 200, "commands-ok.json"));
    server.middlewares.use("/api/goals/", (req, res) => {
      const id = decodeURIComponent((req.url ?? "").replace(/^\//, "").split("?")[0]);
      if (/^[A-Z]+-\d+$/.test(id) && existsSync(`${fixtures}goal-${id}.json`)) send(res, 200, `goal-${id}.json`);
      else send(res, 404, { error: "not_found", reason: `no goal ${id}` });
    });
  },
};

/** In development no server writes the brand into index.html, so Vite does (review E4). The built page keeps the slot for the server. */
const writesBrand: Plugin = {
  name: "goalie-brand",
  apply: "serve",
  transformIndexHtml: (html) => html.replace(BRAND_SLOT, brandHead()),
};

const api = process.env.GOALIE_API;
const token = process.env.GOALIE_TOKEN;

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react(), writesBrand, ...(api ? [] : [servesFixture])],
  server: api ? { proxy: { "/api": { target: api, headers: token ? { authorization: `Bearer ${token}` } : {} } } } : {},
  base: "/",
  build: { outDir: "dist", assetsDir: "assets", emptyOutDir: true },
});
