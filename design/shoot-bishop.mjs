// M5.4: screenshots of the bishop sheet (design/bishop.html), one per pane and theme.
// Needs a dev server running (design/ is served by vite).
//   node design/shoot-bishop.mjs [--base=http://localhost:5173/design/bishop.html] [--out=<folder>]
// Prints file names only.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, sleep } from "../scripts/e2e/cdp.mjs";

const option = (name) => process.argv.slice(2).find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const base = option("base") ?? "http://localhost:5173/design/bishop.html";
const outDir = option("out") ?? join(import.meta.dirname, "..", "docs", "M5", "M5.4", "shots");
mkdirSync(outDir, { recursive: true });

const names = ["large", "facings"];
const browser = await launch({ width: 1500, height: 900 });
try {
  await browser.send("Emulation.setScrollbarsHidden", { hidden: true });
  await browser.send("Page.navigate", { url: base });
  await browser.waitFor(`document.querySelectorAll(".pane").length === ${names.length * 2} && document.querySelectorAll(".pane svg .hero").length >= 12`, 60_000, "sheet rendered");
  await browser.evaluate(`document.fonts.ready.then(() => true)`);
  await sleep(800);

  for (const [i, name] of names.entries()) {
    for (const [j, theme] of ["dark", "light"].entries()) {
      const rect = await browser.evaluate(`(() => { const r = document.querySelectorAll('.pane')[${i * 2 + j}].getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }; })()`);
      const { data } = await browser.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { ...rect, scale: 1 } });
      const file = `${name}-${theme}.png`;
      writeFileSync(join(outDir, file), Buffer.from(data, "base64"));
      console.log(file);
    }
  }
  const problems = browser.logs.filter((line) => /exception|error/i.test(line) && !/status of 404/.test(line));
  if (problems.length) console.log(`console problems:\n${problems.slice(0, 8).join("\n")}`);
} finally {
  await browser.close();
}
