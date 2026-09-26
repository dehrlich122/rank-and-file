// A minimal Chrome DevTools Protocol driver: starts headless Chrome and talks
// to one page over a WebSocket. No dependencies (Node 22+ has WebSocket).
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME_CANDIDATES = {
  win32: [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ],
  darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"],
  linux: ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"],
};

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function findChrome() {
  const candidates = process.env.CHROME_PATH ? [process.env.CHROME_PATH] : (CHROME_CANDIDATES[process.platform] ?? []);
  const found = candidates.find((path) => existsSync(path));
  if (!found) throw new Error("Chrome not found. Set CHROME_PATH to a Chrome or Edge executable.");
  return found;
}

/** Launch headless Chrome and connect to its first page. */
export async function launch({ width = 1400, height = 860 } = {}) {
  const profile = mkdtempSync(join(tmpdir(), "rank-and-file-e2e-"));
  const chrome = spawn(
    findChrome(),
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      `--window-size=${width},${height}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  // Chrome writes the port it picked into DevToolsActivePort.
  let port;
  for (let i = 0; i < 100 && !port; i++) {
    try {
      port = readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0];
    } catch {
      await sleep(100);
    }
  }
  if (!port) throw new Error("Chrome didn't start");
  let page;
  for (let i = 0; i < 50 && !page; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      page = targets.find((target) => target.type === "page");
    } catch {}
    if (!page) await sleep(100);
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => ((ws.onopen = resolve), (ws.onerror = reject)));
  let nextId = 1;
  const waiting = new Map();
  const listeners = [];
  ws.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id && waiting.has(message.id)) {
      const { resolve, reject } = waiting.get(message.id);
      waiting.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    } else if (message.method) {
      for (const listener of listeners) listener(message);
    }
  };

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      waiting.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  /** Evaluate an expression in the page and return its (JSON-able) value. */
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    }
    return result.result.value;
  };

  /** Poll an expression until it's truthy; returns its value. */
  const waitFor = async (expression, timeoutMs = 30_000, label = expression) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const value = await evaluate(expression).catch(() => undefined);
      if (value) return value;
      await sleep(100);
    }
    throw new Error(`timed out after ${timeoutMs} ms waiting for: ${label}`);
  };

  const logs = [];
  listeners.push((message) => {
    if (message.method === "Runtime.consoleAPICalled") {
      logs.push(`[console.${message.params.type}] ${message.params.args.map((a) => a.value ?? a.description).join(" ")}`);
    } else if (message.method === "Runtime.exceptionThrown") {
      const details = message.params.exceptionDetails;
      logs.push(`[exception] ${details.exception?.description ?? details.text}`);
    } else if (message.method === "Log.entryAdded") {
      logs.push(`[log.${message.params.entry.level}] ${message.params.entry.text}`);
    }
  });
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Log.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });

  const key = async (key, { code = key, keyCode, modifiers = 0 } = {}) => {
    const keyCodes = { Enter: 13, Escape: 27, Tab: 9, ArrowUp: 38, ArrowDown: 40, a: 65, f: 70 };
    const windowsVirtualKeyCode = keyCode ?? keyCodes[key] ?? key.toUpperCase().charCodeAt(0);
    await send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode, modifiers });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode, modifiers });
  };

  const screenshot = async () => Buffer.from((await send("Page.captureScreenshot", { format: "png" })).data, "base64");

  const close = async () => {
    try {
      ws.close();
    } catch {}
    chrome.kill();
    await sleep(300);
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {}
  };

  return { send, evaluate, waitFor, key, screenshot, logs, listeners, close };
}
