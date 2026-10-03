// M3.7: the real game next to the approved style sheet. Needs `npm run dev`.
//   node design/shoot-compare.mjs [--part=board]
// Takes, for the dark and the light theme, the style sheet's part (design/sheet.html) and the same
// part of the game (#/styleguide draws the real BoardView on the same sample level), as crops in
// docs/M3/M3.7/shots/. Only the sample level is shown, never solved code.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, sleep } from "../scripts/e2e/cdp.mjs";

const shots = join(import.meta.dirname, "..", "docs", "M3", "M3.7", "shots");
const BASE = "http://localhost:5173";
// each part: the crop's selector on the style sheet, and on the game's style guide, per theme (the first match is the dark pane)
const PARTS = {
  board: { sheet: ".pane .board-row", game: ".sg-pane .sg-board-row", ready: `document.querySelectorAll('.board').length >= 4` },
};
const part = process.argv.find((arg) => arg.startsWith("--part="))?.slice(7) ?? "board";
const spec = PARTS[part];
if (!spec) throw new Error(`unknown part: ${part}`);

mkdirSync(shots, { recursive: true });
const browser = await launch({ width: 1840, height: 1100 });
try {
  await browser.send("Emulation.setScrollbarsHidden", { hidden: true });
  for (const [name, url, selector] of [
    ["sheet", `${BASE}/design/sheet.html?still`, spec.sheet],
    ["game", `${BASE}/?fresh=cmp#/styleguide`, spec.game],
  ]) {
    await browser.send("Page.navigate", { url });
    await browser.waitFor(spec.ready, 60_000, `${name} page`);
    await browser.evaluate(`document.fonts.ready.then(() => true)`);
    await sleep(600);
    for (const [index, theme] of ["dark", "light"].entries()) {
      // `data-still` holds the glitch on the sheet; the game's enemies are at rest in a reduced-motion run
      const box = await browser.evaluate(`(() => { const r = document.querySelectorAll(${JSON.stringify(selector)})[${index}].getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height }; })()`);
      const { data } = await browser.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { ...box, scale: 1 } });
      const out = join(shots, `step1-${part}-${name}-${theme}.png`);
      writeFileSync(out, Buffer.from(data, "base64"));
      console.log(`saved ${out}`);
    }
  }
} finally {
  await browser.close();
}
