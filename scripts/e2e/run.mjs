// Runs the end-to-end checks in headless Chrome against a running server.
//
//   npm run dev                       (in another terminal)
//   npm run e2e                       all suites against http://localhost:5173/
//   npm run e2e -- http://localhost:4173/ --only=app
//
// Suites: harness, app, ui, editor, share, free, functions. `functions` is the player's own functions (Chapter 7) and
// runs alone in about a minute (--only=functions). `share` and `free` need the dev server (npm run dev): they make
// share codes in the page by importing src/share/codec.ts, and `free` also tries "Save to the repo", a dev-only
// button (that check skips itself on a build).
//
// Writes e2e-results/report.json (every check, its timing and console output)
// and a screenshot per failure, with code editors blurred.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import appChecks from "./app.check.mjs";
import { launch } from "./cdp.mjs";
import editorChecks from "./editor.check.mjs";
import freeChecks from "./free.check.mjs";
import functionsChecks from "./functions.check.mjs";
import harnessChecks from "./harness.check.mjs";
import shareChecks from "./share.check.mjs";
import uiChecks from "./ui.check.mjs";
import { ChromeDied, createSuite } from "./suite.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const base = (args.find((arg) => /^https?:\/\//.test(arg)) ?? "http://localhost:5173/").replace(/\/?$/, "/");
const only = args.find((arg) => arg.startsWith("--only="))?.slice("--only=".length);
const outDir = join(root, "e2e-results");

const suites = { harness: harnessChecks, app: appChecks, ui: uiChecks, editor: editorChecks, share: shareChecks, free: freeChecks, functions: functionsChecks };

try {
  await fetch(base);
} catch {
  console.error(`Nothing is answering at ${base}. Start the game first (npm run dev), or pass its URL.`);
  process.exit(2);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const started = Date.now();
const report = { base, startedAt: new Date().toISOString(), suites: [] };
// Headless Chrome's renderer sometimes dies on this machine (STATUS_BREAKPOINT, nothing to do with the game, QA5).
// A suite whose Chrome died is run again from its first check on a new Chrome, up to this many attempts.
const ATTEMPTS = 3;

async function startBrowser() {
  const browser = await launch();
  // A `?fresh=` page load is like a first visit: everything the game saved is
  // cleared except the settings, so no editor holds code saved by an earlier
  // check. (Clearing every other key, rather than naming the progress key,
  // keeps that true if a key is renamed.) `?reload=` keeps everything.
  await browser.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `if (location.search.includes("fresh=")) {
    for (const key of Object.keys(localStorage)) if (key.startsWith("rank-and-file:") && key !== "rank-and-file:settings") localStorage.removeItem(key);
  }`,
  });
  return browser;
}

/** Run one suite on `browser`. Returns its suite, plus where Chrome died if it did. */
async function runSuite(name, run, browser) {
  console.log(`\n── ${name} ──`);
  const suite = createSuite(name, browser, outDir);
  try {
    await run({ browser, base, root, check: suite.check });
  } catch (error) {
    if (error instanceof ChromeDied) return { suite, diedAt: error.label };
    // Chrome died between two checks: the suite's own code met the dead page.
    if (browser.crashed()) return { suite, diedAt: `after "${suite.checks.at(-1)?.label ?? "the start"}"` };
    suite.checks.push({ label: "suite crashed", ok: false, error: String(error?.stack ?? error), ms: 0 });
    console.log(`FAIL  ${name} suite crashed — ${error?.message ?? error}`);
  }
  return { suite };
}

let browser = await startBrowser();
try {
  for (const [name, run] of Object.entries(suites)) {
    if (only && only !== name) continue;
    let restarts = 0;
    let result;
    for (;;) {
      result = await runSuite(name, run, browser);
      if (!result.diedAt) break;
      await browser.close();
      browser = await startBrowser();
      if (restarts === ATTEMPTS - 1) break;
      restarts++;
      console.log(`RESTART  ${name}: Chrome died at ${result.diedAt}; new Chrome, attempt ${restarts + 1} of ${ATTEMPTS}`);
    }
    const { suite, diedAt } = result;
    if (diedAt) {
      const error = `Chrome died at ${diedAt}, on each of ${ATTEMPTS} attempts`;
      suite.checks.push({ label: `Chrome crashed ${ATTEMPTS} times`, ok: false, error, ms: 0 });
      console.log(`FAIL  ${suite.checks.at(-1).label}  — ${error}`);
    }
    report.suites.push({ name: suite.name, restarts, checks: suite.checks });
  }
} finally {
  await browser.close();
}

report.durationMs = Date.now() - started;
const all = report.suites.flatMap((suite) => suite.checks);
const failed = all.filter((check) => !check.ok);
report.summary = { total: all.length, passed: all.length - failed.length, failed: failed.length };
writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
const restarted = report.suites.filter((suite) => suite.restarts).map((suite) => `${suite.name} ×${suite.restarts}`);
console.log(
  `\n${report.summary.passed}/${report.summary.total} passed in ${(report.durationMs / 1000).toFixed(0)} s` +
    `${restarted.length ? ` · restarted: ${restarted.join(", ")}` : ""}` +
    ` · report: e2e-results/report.json${failed.length ? " (failure screenshots alongside)" : ""}`,
);
process.exit(failed.length ? 1 : 0);
