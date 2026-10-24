import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { BRAND_SLOT, brandHead } from "../src/brand.ts";

/**
 * The React app (ADR 0010). `vite build` writes web/dist, which the Node server serves.
 * In development /api goes to GOALIE_API when it is set, else to the seed fixture, so the app runs with no server.
 * The server refuses a request with no verified actor, so a proxied request carries GOALIE_TOKEN as its bearer token.
 */

const fixture = fileURLToPath(new URL("fixtures/priorities.json", import.meta.url));

const servesFixture: Plugin = {
  name: "goalie-fixture",
  configureServer(server) {
    server.middlewares.use("/api/priorities", (_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(readFileSync(fixture));
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
