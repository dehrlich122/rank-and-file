// M3.7 step 0, rounds 3 and 4: one full-page screenshot of a small design page. Needs `npm run dev`.
//   node design/shoot-directions.mjs [out.png]                       round 3 (directions.html)
//   node design/shoot-directions.mjs [out.png] --page=round4         round 4, animations held still
//   node design/shoot-directions.mjs [out.png] --page=round5         round 5, animations held still
//   node design/shoot-directions.mjs [out.png] --page=sheet          round 6, the full style sheet
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { launch, sleep } from "../scripts/e2e/cdp.mjs";

const args = process.argv.slice(2);
const page = args.find((arg) => arg.startsWith("--page="))?.slice(7) ?? "directions";
// each page: its screenshot's name, and what to wait for before taking it
const PAGES = {
  directions: { file: "round3-directions.png", ready: `document.querySelectorAll('.dir .board').length === 4` },
  round4: { file: "round4-wireframe-world.png", ready: `document.querySelectorAll('.dir .board').length === 3`, still: true },
  round5: { file: "round5-solid-hero.png", ready: `document.documentElement.dataset.ready !== undefined`, still: true },
  sheet: { file: "round6-style-sheet.png", ready: `document.querySelectorAll('.pane .board').length >= 6 && document.querySelector('.cm-editor')`, still: true },
};
const spec = PAGES[page];
if (!spec) throw new Error(`unknown page: ${page}`);
const out = args.find((arg) => !arg.startsWith("--")) ?? join(import.meta.dirname, "..", "docs", "M3", "M3.7", "shots", spec.file);
const browser = await launch({ width: 1840, height: 1000 });
try {
  await browser.send("Emulation.setScrollbarsHidden", { hidden: true });
  await browser.send("Page.navigate", { url: `http://localhost:5173/design/${page}.html${spec.still ? "?still" : ""}` });
  await browser.waitFor(spec.ready, 60_000, "the page");
  await browser.evaluate(`document.fonts.ready.then(() => true)`);
  await sleep(500);
  const size = await browser.evaluate(`({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight })`);
  const { data } = await browser.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, ...size, scale: 1 } });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(data, "base64"));
  console.log(`saved ${out}`);
  const problems = browser.logs.filter((line) => /exception|error/i.test(line) && !/status of 404/.test(line));
  if (problems.length) console.log(`console problems:\n${problems.slice(0, 8).join("\n")}`);
} finally {
  await browser.close();
}
