import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

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

const api = process.env.GOALIE_API;
const token = process.env.GOALIE_TOKEN;

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react(), ...(api ? [] : [servesFixture])],
  server: api ? { proxy: { "/api": { target: api, headers: token ? { authorization: `Bearer ${token}` } : {} } } } : {},
  base: "/",
  build: { outDir: "dist", assetsDir: "assets", emptyOutDir: true },
});
