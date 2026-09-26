// A tiny check runner. Each check is an async function that throws on failure
// (use `expect`). Results go to the console and to e2e-results/report.json,
// and every failure saves a screenshot, with code editors blurred so a failing
// reference-solution check can never show solution code.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

class CheckFailed extends Error {}

export function expect(condition, message) {
  if (!condition) throw new CheckFailed(message);
}

export function createSuite(name, browser, outDir) {
  const checks = [];
  let logStart = browser.logs.length;

  async function check(label, fn) {
    const started = Date.now();
    const entry = { label, ok: false, ms: 0 };
    try {
      entry.detail = (await fn()) ?? "";
      entry.ok = true;
    } catch (error) {
      entry.error = error instanceof CheckFailed ? error.message : `${error.name}: ${error.message}`;
      entry.screenshot = await saveFailureScreenshot(label).catch((e) => `screenshot failed: ${e.message}`);
    }
    entry.ms = Date.now() - started;
    entry.console = browser.logs.slice(logStart);
    logStart = browser.logs.length;
    checks.push(entry);
    const text = entry.ok ? entry.detail : entry.error;
    console.log(`${entry.ok ? "PASS" : "FAIL"}  ${label}${text ? `  — ${String(text).slice(0, 160)}` : ""}`);
  }

  async function saveFailureScreenshot(label) {
    await browser.evaluate(
      `document.querySelectorAll('.cm-content').forEach((el) => { el.dataset.e2eBlur = el.style.filter; el.style.filter = 'blur(7px)'; })`,
    );
    const png = await browser.screenshot();
    await browser.evaluate(
      `document.querySelectorAll('.cm-content').forEach((el) => { el.style.filter = el.dataset.e2eBlur ?? ''; })`,
    );
    mkdirSync(outDir, { recursive: true });
    const file = `${name}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}.png`;
    writeFileSync(join(outDir, file), png);
    return file;
  }

  return { name, checks, check };
}
