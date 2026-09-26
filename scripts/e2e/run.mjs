// Runs the end-to-end checks in headless Chrome against a running server.
//
//   npm run dev                       (in another terminal)
//   npm run e2e                       all suites against http://localhost:5173/
//   npm run e2e -- http://localhost:4173/ --only=app
//
// Writes e2e-results/report.json (every check, its timing and console output)
// and a screenshot per failure, with code editors blurred.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import appChecks from "./app.check.mjs";
import { launch } from "./cdp.mjs";
import harnessChecks from "./harness.check.mjs";
import uiChecks from "./ui.check.mjs";
import { createSuite } from "./suite.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const base = (args.find((arg) => /^https?:\/\//.test(arg)) ?? "http://localhost:5173/").replace(/\/?$/, "/");
const only = args.find((arg) => arg.startsWith("--only="))?.slice("--only=".length);
const outDir = join(root, "e2e-results");

const suites = { harness: harnessChecks, app: appChecks, ui: uiChecks };

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
const browser = await launch();
// A `?fresh=` page load starts with no saved progress (so no saved code in the
// editors), like a first visit. Settings are kept. `?reload=` keeps both.
await browser.send("Page.addScriptToEvaluateOnNewDocument", {
  source: `if (location.search.includes("fresh=")) localStorage.removeItem("rank-and-file:progress");`,
});
try {
  for (const [name, run] of Object.entries(suites)) {
    if (only && only !== name) continue;
    console.log(`\n── ${name} ──`);
    const suite = createSuite(name, browser, outDir);
    try {
      await run({ browser, base, root, check: suite.check });
    } catch (error) {
      suite.checks.push({ label: "suite crashed", ok: false, error: String(error?.stack ?? error), ms: 0 });
      console.log(`FAIL  ${name} suite crashed — ${error?.message ?? error}`);
    }
    report.suites.push({ name: suite.name, checks: suite.checks });
  }
} finally {
  await browser.close();
}

report.durationMs = Date.now() - started;
const all = report.suites.flatMap((suite) => suite.checks);
const failed = all.filter((check) => !check.ok);
report.summary = { total: all.length, passed: all.length - failed.length, failed: failed.length };
writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
console.log(
  `\n${report.summary.passed}/${report.summary.total} passed in ${(report.durationMs / 1000).toFixed(0)} s` +
    ` · report: e2e-results/report.json${failed.length ? " (failure screenshots alongside)" : ""}`,
);
process.exit(failed.length ? 1 : 0);
