#!/usr/bin/env node
// Rank & File: a small local web server for the game, with the right file types.
//
//   node serve.mjs            serve the game and open it in your browser
//   node serve.mjs --check    check this computer and folder can run the game
//   node serve.mjs --no-open  serve it without opening a browser
//
// It listens only on this computer (127.0.0.1), on the first free port from
// 8000 to 8010. Press Ctrl+C, or close the window, to stop it.
//
// Works with Node.js 18 or later, and needs nothing else installed.
import { spawn } from "node:child_process";
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIRST_PORT = 8000;
const LAST_PORT = 8010;

// Browsers only run the game's scripts and WebAssembly when they're served
// with these types.
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".zip": "application/zip",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".md": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

// Files the game can't start without (plus its main script, found by name).
const REQUIRED = [
  "index.html",
  "pyodide/pyodide.mjs",
  "pyodide/pyodide.asm.mjs",
  "pyodide/pyodide.asm.wasm",
  "pyodide/python_stdlib.zip",
  "pyodide/pyodide-lock.json",
];

function handle(request, response) {
  let file = normalize(join(HERE, decodeURIComponent(new URL(request.url, "http://localhost").pathname)));
  if (file !== HERE && !file.startsWith(HERE + sep)) {
    response.writeHead(403).end();
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file)) {
    response.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
    return;
  }
  response.writeHead(200, { "Content-Type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream" });
  createReadStream(file).pipe(response);
}

/** Start serving on the first free port from 8000 to 8010; resolves to the port, or null. */
function listen(server, port = FIRST_PORT) {
  return new Promise((resolve, reject) => {
    server.once("error", (error) => {
      if (error.code === "EADDRINUSE" && port < LAST_PORT) resolve(listen(server, port + 1));
      else if (error.code === "EADDRINUSE") resolve(null);
      else reject(error);
    });
    server.listen(port, "127.0.0.1", () => resolve(port));
  });
}

function openBrowser(url) {
  const [command, args] =
    process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  spawn(command, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
}

function line(ok, text) {
  console.log(`${ok ? "  [ok] " : "  [!!] "}${text}`);
  return ok;
}

/** Check everything the game needs; print what's wrong. Returns an exit code. */
async function check() {
  console.log(`Checking with Node.js ${process.version}.\n`);
  let ok = line(Number(process.versions.node.split(".")[0]) >= 18, "Node.js 18 or later");

  const missing = REQUIRED.filter((name) => !existsSync(join(HERE, name)));
  const assets = join(HERE, "assets");
  const script = existsSync(assets) ? readdirSync(assets).find((name) => /^index-.*\.js$/.test(name)) : undefined;
  if (!script) missing.push("assets/index-*.js");
  ok = line(missing.length === 0, missing.length ? `missing files: ${missing.join(", ")}` : "the game's files are all here") && ok;

  const server = createServer(handle);
  const port = await listen(server);
  ok = line(port !== null, port ? `a free port: ${port}` : "no free port from 8000 to 8010") && ok;

  if (port && missing.length === 0) {
    // Serve for a moment and fetch the key files the way a browser will.
    const probes = [
      ["index.html", "text/html"],
      [`assets/${script}`, "text/javascript"],
      ["pyodide/pyodide.mjs", "text/javascript"],
      ["pyodide/pyodide.asm.wasm", "application/wasm"],
    ];
    for (const [path, expected] of probes) {
      let got;
      let passed = false;
      try {
        const response = await fetch(`http://127.0.0.1:${port}/${path}`);
        got = (response.headers.get("content-type") ?? "").split(";")[0];
        passed = response.ok && got === expected;
        await response.body?.cancel();
      } catch (error) {
        got = String(error);
      }
      ok = line(passed, `serves ${path}${passed ? ` as ${expected}` : `: got ${got}, needs ${expected}`}`) && ok;
    }
  }
  server.close();

  console.log("\n  Use a recent Chrome, Edge or Firefox (or Safari 16.4 or later) to play.\n");
  if (ok) {
    console.log("Ready. Start the game with Start game.cmd (Windows), sh start-game.sh, or: node serve.mjs");
    return 0;
  }
  console.log("Not ready yet: fix the items marked [!!] above. README.md has help.");
  return 1;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--check")) {
    process.exitCode = await check();
    return;
  }
  const server = createServer(handle);
  const port = await listen(server);
  if (port === null) {
    console.log("Ports 8000 to 8010 are all in use. Close another local web server and try again.");
    process.exitCode = 1;
    return;
  }
  const url = `http://localhost:${port}/`;
  console.log(`Rank & File is running at ${url}`);
  console.log("Keep this window open while you play. Press Ctrl+C (or close the window) to stop.");
  if (!args.includes("--no-open")) openBrowser(url);
}

await main();
