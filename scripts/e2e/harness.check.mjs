// End-to-end checks for the raw Python harness (#/harness): the worker, the
// line budget, the watchdog and error reporting, with no level around them.
import { sleep } from "./cdp.mjs";
import { expect } from "./suite.mjs";

export default async function harnessChecks({ browser: b, base, check }) {
  async function example(label) {
    await b.evaluate(`[...document.querySelectorAll('.examples button')].find((x) => x.textContent === ${JSON.stringify(label)}).click()`);
    await sleep(20);
    await b.waitFor(`!document.querySelector('.run-meta').textContent.startsWith('Running')`, 20_000, label);
    return b.evaluate(`({
      meta: document.querySelector('.run-meta').textContent,
      output: document.querySelector('.output').textContent,
      error: document.querySelector('.error-card').hidden ? null : document.querySelector('.error-card p').textContent,
    })`);
  }

  await check("harness: Python loads", async () => {
    await b.send("Page.navigate", { url: `${base}#/harness` });
    const status = await b.waitFor(
      `(() => { const s = document.querySelector('.status'); return s && s.dataset.state !== 'loading' ? s.dataset.state + ' | ' + s.textContent : '' })()`,
      60_000,
      "Python ready",
    );
    expect(status.startsWith("ready"), status);
    await b.waitFor(`document.querySelector('.examples button')`, 5000, "harness page");
    return status;
  });

  await check("harness: runs a program and captures its output", async () => {
    const r = await example("Hello");
    expect(r.meta.startsWith("✓ Finished") && r.output.includes("Hello from real Python!"), r.meta);
    return r.meta;
  });

  await check("harness: the line budget stops an endless loop", async () => {
    const r = await example("Endless loop");
    expect(r.meta.startsWith("⏱ Stopped") && r.error?.includes("never finished"), `${r.meta} | ${r.error}`);
    const again = await example("Hello");
    expect(again.meta.startsWith("✓ Finished"), `next run: ${again.meta}`);
    return r.meta;
  });

  await check("harness: the watchdog stops a C-level hang and Python is ready again", async () => {
    await sleep(3000); // let the spare worker finish loading
    const r = await example("Stuck in C");
    expect(r.meta.includes("watchdog"), r.meta);
    const again = await example("Hello");
    expect(again.meta.startsWith("✓ Finished"), `next run: ${again.meta}`);
    return again.meta;
  });

  await check("harness: syntax and runtime errors point at the line", async () => {
    const syntax = await example("Syntax error");
    const runtime = await example("Runtime error");
    expect(syntax.error?.includes("line 2") || syntax.error?.includes("Line 2") || syntax.meta.includes("Error"), syntax.meta);
    expect(runtime.meta.startsWith("✗ Error"), runtime.meta);
    return `${syntax.error} | ${runtime.error}`;
  });
}
