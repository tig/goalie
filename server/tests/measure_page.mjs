// Open one page in headless Chrome at a given size and print what an expression measures, as JSON.
// Usage: node measure_page.mjs <chrome> <url> <width> <height> <expression>
// The expression returns null until the page is ready. GOALIE_TOKEN, when set, is sent as the bearer token.
// It uses the Chrome DevTools Protocol over Node's own WebSocket, so the repo needs no browser package.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [chrome, url, width, height, expression] = process.argv.slice(2);
const profile = mkdtempSync(join(tmpdir(), "goalie-chrome-"));
// --no-sandbox: CI runners refuse Chrome's sandbox. The page is the test's own server on 127.0.0.1.
const browser = spawn(chrome, ["--headless=new", "--no-sandbox", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(what, read, seconds = 20) {
  for (let i = 0; i < seconds * 10; i++) {
    const value = await read();
    if (value !== null && value !== undefined) return value;
    await wait(100);
  }
  throw new Error(`timed out: ${what}`);
}

try {
  const portFile = join(profile, "DevToolsActivePort");
  const port = await until("Chrome DevTools port", () => (existsSync(portFile) && readFileSync(portFile, "utf-8").split("\n")[0]) || null);
  const page = await until("a page target", async () => {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json()).catch(() => []);
    return targets.find((t) => t.type === "page") ?? null;
  });
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let next = 0;
  const pending = new Map();
  ws.onmessage = (message) => {
    const reply = JSON.parse(message.data);
    const call = pending.get(reply.id);
    if (!call) return;
    pending.delete(reply.id);
    if (reply.error) call.reject(new Error(JSON.stringify(reply.error)));
    else call.resolve(reply.result);
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      next += 1;
      pending.set(next, { resolve, reject });
      ws.send(JSON.stringify({ id: next, method, params }));
    });
  await send("Emulation.setDeviceMetricsOverride", { width: Number(width), height: Number(height), deviceScaleFactor: 1, mobile: true });
  await send("Network.enable");
  if (process.env.GOALIE_TOKEN) await send("Network.setExtraHTTPHeaders", { headers: { Authorization: `Bearer ${process.env.GOALIE_TOKEN}` } });
  await send("Page.navigate", { url });
  const value = await until("the page to be ready", async () => {
    const answer = await send("Runtime.evaluate", { expression: `(${expression})`, returnByValue: true, awaitPromise: true }).catch(() => undefined);
    if (answer?.exceptionDetails) throw new Error(JSON.stringify(answer.exceptionDetails));
    return answer?.result?.value ?? null;
  });
  process.stdout.write(JSON.stringify(value));
  ws.close();
} finally {
  browser.kill();
  await wait(200);
  rmSync(profile, { recursive: true, force: true });
}
