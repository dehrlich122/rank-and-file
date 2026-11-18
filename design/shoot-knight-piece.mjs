// M5.1: screenshots of the knight sheet (design/knight-piece.html), one per pane and theme, and a check that
// each jump take ends where and how it should. Needs a dev server running (design/ is served by vite).
//   node design/shoot-knight-piece.mjs [--base=http://localhost:5173/design/knight-piece.html]
// Prints file names and results only.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, sleep } from "../scripts/e2e/cdp.mjs";

const option = (name) => process.argv.slice(2).find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const base = option("base") ?? "http://localhost:5173/design/knight-piece.html";
const outDir = join(import.meta.dirname, "..", "docs", "M5", "M5.1", "shots");
mkdirSync(outDir, { recursive: true });

const browser = await launch({ width: 1520, height: 900 });
try {
  await browser.send("Emulation.setScrollbarsHidden", { hidden: true });
  await browser.send("Page.navigate", { url: base });
  await browser.waitFor(`document.querySelectorAll(".pane").length === 10 && document.querySelectorAll(".pane .skin-card svg").length >= 6`, 60_000, "sheet rendered");
  await browser.evaluate(`document.fonts.ready.then(() => true)`);
  await sleep(800);

  const names = ["hero", "jump", "trail", "landing", "settings-skins"];
  for (const [i, name] of names.entries()) {
    for (const [j, theme] of ["dark", "light"].entries()) {
      const rect = await browser.evaluate(`(() => { const r = document.querySelectorAll('.pane')[${i * 2 + j}].getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }; })()`);
      const { data } = await browser.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { ...rect, scale: 1 } });
      writeFileSync(join(outDir, `${name}-${theme}.png`), Buffer.from(data, "base64"));
      console.log(`saved ${name}-${theme}.png`);
    }
  }

  // each jump take, played in the dark jump pane (the 3rd): where it ends, and which way it faces
  for (const [take, button] of [["J1", 1], ["J1", 2], ["J2", 1], ["J2", 2], ["R", 1]]) {
    const where = `document.querySelectorAll('.pane')[2].querySelector('[data-take="${take}"]')`;
    await browser.evaluate(`${where}.querySelectorAll('button')[${button - 1}].click()`);
    await sleep(button === 1 && take !== "R" ? 3200 : take === "R" ? 2200 : 1200);
    const end = await browser.evaluate(`(() => { const b = ${where}.querySelector('svg'); return b.dataset.at + ' facing ' + b.dataset.facing; })()`);
    console.log(`${take} button ${button}: ends ${end}`);
  }
  const problems = browser.logs.filter((line) => /exception|error/i.test(line) && !/status of 404/.test(line));
  if (problems.length) console.log(`console problems:\n${problems.slice(0, 8).join("\n")}`);
} finally {
  await browser.close();
}
