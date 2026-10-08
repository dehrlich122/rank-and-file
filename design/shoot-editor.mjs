// M4.2 step 0: screenshots of the editor layout sheet (design/editor.html), one per pane.
// Needs `npm run dev` running. Prints file names only.
//   node design/shoot-editor.mjs [--base=http://localhost:5173/design/editor.html]
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, sleep } from "../scripts/e2e/cdp.mjs";

const option = (name) => process.argv.slice(2).find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const base = option("base") ?? "http://localhost:5173/design/editor.html";
const outDir = join(import.meta.dirname, "..", "docs", "M4", "M4.2", "shots");
mkdirSync(outDir, { recursive: true });

const browser = await launch({ width: 1520, height: 900 });
try {
  await browser.send("Emulation.setScrollbarsHidden", { hidden: true });
  await browser.send("Page.navigate", { url: `${base}?still` });
  await browser.waitFor(`document.querySelectorAll('.pane .board').length >= 4`, 60_000, "sheet rendered");
  await browser.evaluate(`document.fonts.ready.then(() => true)`);
  await sleep(800);
  const names = ["take-a-dark", "take-a-light", "take-b-dark", "take-b-light"];
  for (const [i, name] of names.entries()) {
    const rect = await browser.evaluate(`(() => { const r = document.querySelectorAll('.pane')[${i}].getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }; })()`);
    const { data } = await browser.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { ...rect, scale: 1 } });
    writeFileSync(join(outDir, `${name}.png`), Buffer.from(data, "base64"));
    console.log(`saved ${name}.png`);
  }
  const problems = browser.logs.filter((line) => /exception|error/i.test(line) && !/status of 404/.test(line));
  if (problems.length) console.log(`console problems:\n${problems.slice(0, 8).join("\n")}`);
} finally {
  await browser.close();
}
