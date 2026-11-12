// Open one page in headless Chrome at a given size and print what an expression measures, as JSON.
// Usage: node measure_page.mjs <chrome> <url> <width> <height> <expression>
// The expression returns null until the page is ready. GOALIE_TOKEN, when set, is sent as the bearer token.
// It uses the Chrome DevTools Protocol over Node's own WebSocket, so the repo needs no browser package.
// Real input: the page calls goalieInput(JSON of a command) and waits for window.__goalieInputDone[id]. The command goes through Chrome's own input
// (Input.dispatchMouseEvent, Input.dispatchKeyEvent, Input.insertText), as a person's mouse and keys do, not through dispatchEvent.
// Commands: {mouse: "left" | "right", x, y}, {key: "Escape" | "Enter" | "Tab" | "ContextMenu" | "F10", shift?: true}, {text},
// {touch: "on"}, then {touch: "long" | "tap", x, y, ms?, dx?, dy?} (one finger through Input.dispatchTouchEvent; dx and dy move it while it is down).
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [chrome, url, width, height, expression] = process.argv.slice(2);
// A cold first start on a CI runner can miss the wait for the DevTools port, so Chrome gets one more start in a new profile (Chrome stuck at start-up failed setUpClass on #101 and #102).
const START_SECONDS = Number(process.env.GOALIE_CHROME_START_SECONDS ?? 30);
const STARTS = 2;
let profile;
let browser;
const launch = () => {
  profile = mkdtempSync(join(tmpdir(), "goalie-chrome-"));
  // --no-sandbox: the only page is the test's own server on 127.0.0.1.
  browser = spawn(chrome, ["--headless=new", "--no-sandbox", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const KEYS = {
  Escape: { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
  Enter: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" },
  Tab: { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 },
  ContextMenu: { key: "ContextMenu", code: "ContextMenu", windowsVirtualKeyCode: 93 },
  F10: { key: "F10", code: "F10", windowsVirtualKeyCode: 121 },
};

async function until(what, read, seconds = 20) {
  for (let i = 0; i < seconds * 10; i++) {
    const value = await read();
    if (value !== null && value !== undefined) return value;
    await wait(100);
  }
  throw new Error(`timed out: ${what}`);
}

const stop = async () => {
  browser.kill();
  await wait(200);
  // Chrome can still be writing its profile as it exits. A failed cleanup must not hide the run's own error.
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    // The OS clears its temp folder.
  }
};

/** Start Chrome and wait for its DevTools port. A start that writes no port in START_SECONDS is stopped and tried again, up to STARTS times. */
async function devToolsPort() {
  for (let start = 1; ; start++) {
    launch();
    const portFile = join(profile, "DevToolsActivePort");
    try {
      return await until("Chrome DevTools port", () => (existsSync(portFile) && readFileSync(portFile, "utf-8").split("\n")[0]) || null, START_SECONDS);
    } catch (error) {
      if (start >= STARTS) throw error;
      process.stderr.write(`Chrome start ${start} wrote no DevTools port in ${START_SECONDS} s; starting it again.\n`);
      await stop();
    }
  }
}

try {
  const port = await devToolsPort();
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
  let touching = false;
  const pending = new Map();
  const realInput = async (command) => {
    if (command.mouse) {
      const at = { x: command.x, y: command.y };
      const button = { button: command.mouse, buttons: command.mouse === "right" ? 2 : 1, clickCount: 1 };
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...at });
      await send("Input.dispatchMouseEvent", { type: "mousePressed", ...at, ...button });
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...at, ...button, buttons: 0 });
    } else if (command.key) {
      const { text, ...key } = KEYS[command.key];
      const modifiers = command.shift ? 8 : 0;
      await send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", modifiers, ...key, ...(text ? { text } : {}) });
      await send("Input.dispatchKeyEvent", { type: "keyUp", modifiers, ...key });
    } else if (typeof command.text === "string") {
      await send("Input.insertText", { text: command.text });
    } else if (command.touch) {
      // One finger, as a phone sends it: down, held for `ms`, moved by dx and dy on the way when given, then up.
      // {touch: "on"} makes the page a touch screen first. Its layout changes (pointer: coarse), so a step measures where to press after it.
      if (!touching) {
        await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
        touching = true;
      }
      if (command.touch === "on") return;
      const ms = command.ms ?? (command.touch === "long" ? 700 : 60);
      await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: command.x, y: command.y }] });
      const steps = command.dx || command.dy ? 5 : 0;
      for (let i = 1; i <= steps; i++) {
        await wait(20);
        await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: command.x + ((command.dx ?? 0) * i) / steps, y: command.y + ((command.dy ?? 0) * i) / steps }] });
      }
      await wait(Math.max(0, ms - steps * 20));
      await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } else {
      throw new Error(`unknown input ${JSON.stringify(command)}`);
    }
  };
  const done = (id, error) => send("Runtime.evaluate", { expression: `window.__goalieInputDone?.[${id}]?.(${error ? JSON.stringify(error) : ""})` });
  ws.onmessage = (message) => {
    const reply = JSON.parse(message.data);
    if (reply.method === "Runtime.bindingCalled" && reply.params.name === "goalieInput") {
      const command = JSON.parse(reply.params.payload);
      realInput(command).then(() => done(command.id), (error) => done(command.id, String(error)));
      return;
    }
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
  await send("Runtime.enable");
  await send("Runtime.addBinding", { name: "goalieInput" });
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
  await stop();
}
