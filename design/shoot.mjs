// M3.7 step 0: screenshots of the style tiles, for the readability check.
// Needs `npm run dev` running. Prints file names only.
//
//   node design/shoot.mjs --all [--only=noir-pixel,noir-vector]
//       each variant: normal, greyscale, reduced motion, glitch held, the 20px board in greyscale;
//       the noir variants also get their title screen in both themes
//   node design/shoot.mjs noir-vector --crop=".pane .board-row" --out=x.png [--scale=2] [--grey] [--reduced] [--freeze] [--light]
//
// Never point it at a level: the tiles show fresh sample code, never a solution.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { launch, sleep } from "../scripts/e2e/cdp.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const base = option("base") ?? "http://localhost:5173/design/tiles.html";
const outDir = join(import.meta.dirname, "..", "docs", "M3", "M3.7", "shots");

/** Each variant: a tile, and for the noir tile a sprite style. */
const VARIANTS = {
  snes: { tile: "snes" },
  neon: { tile: "neon" },
  terminal: { tile: "terminal" },
  "noir-pixel": { tile: "noir", sprites: "pixel" },
  "noir-vector": { tile: "noir", sprites: "vector" },
};

const browser = await launch({ width: 1840, height: 1000 });
// No scrollbar: otherwise a capture below the fold resizes the page, the scrollbar goes, and the layout shifts under the crop.
await browser.send("Emulation.setScrollbarsHidden", { hidden: true });

/** Open a variant and wait until the boards and fonts are in. */
async function open(id, { reduced = false, freeze = false, state = "", skin = "" } = {}) {
  const { tile, sprites } = VARIANTS[id];
  await browser.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" }] });
  const query = new URLSearchParams({ tile, motion: reduced ? "reduced" : "full" });
  if (sprites) query.set("sprites", sprites);
  if (freeze) query.set("freeze", "burst");
  if (state) query.set("state", state);
  if (skin) query.set("skin", skin);
  await browser.send("Page.navigate", { url: `${base}?${query}` });
  await browser.waitFor(`document.querySelectorAll('.pane .board').length >= 4 && document.querySelector('.cm-editor')`, 60_000, "tile rendered");
  await browser.evaluate(`document.fonts.ready.then(() => true)`);
  await sleep(700);
}

/** Screenshot a region (by selector, or the whole page) to `file`. */
async function shoot(file, { selector, scale = 1, grey = false } = {}) {
  await browser.send("Emulation.setEmulatedVisionDeficiency", { type: grey ? "achromatopsia" : "none" });
  const rect = selector
    ? await browser.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }; })()`)
    : await browser.evaluate(`({ x: 0, y: 0, width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight })`);
  const { data } = await browser.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { ...rect, scale } });
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(data, "base64"));
  console.log(`saved ${file}`);
}

try {
  if (flag("all")) {
    const only = option("only")?.split(",");
    for (const id of Object.keys(VARIANTS).filter((v) => !only || only.includes(v))) {
      await open(id);
      await shoot(join(outDir, `${id}-normal.png`));
      await shoot(join(outDir, `${id}-greyscale.png`), { grey: true });
      // the smallest board we ship (20px squares), in greyscale, both themes, blown up 4x so the pixels can be judged
      for (const scheme of ["dark", "light"]) {
        await shoot(join(outDir, `${id}-min-size-greyscale-${scheme}.png`), { selector: `.pane[data-scheme=${scheme}] .board-min`, scale: 4, grey: true });
        if (VARIANTS[id].tile === "noir") await shoot(join(outDir, `${id}-title-${scheme}.png`), { selector: `.pane[data-scheme=${scheme}] .menu-mock` });
      }
      await open(id, { reduced: true });
      await shoot(join(outDir, `${id}-reduced-motion.png`));
      await open(id, { freeze: true });
      await shoot(join(outDir, `${id}-glitch-held.png`), { selector: ".pane[data-scheme=dark] .board-row" });
    }
  } else {
    const id = args.find((arg) => arg in VARIANTS) ?? "noir-pixel";
    await open(id, { reduced: flag("reduced"), freeze: flag("freeze"), state: option("state"), skin: option("skin") });
    const scheme = flag("light") ? "light" : "dark";
    const crop = option("crop");
    await shoot(option("out") ?? join(outDir, `${id}-crop.png`), {
      selector: crop ? crop.replace(".pane", `.pane[data-scheme=${scheme}]`) : undefined,
      scale: Number(option("scale") ?? 1),
      grey: flag("grey"),
    });
  }
  const problems = browser.logs.filter((line) => /exception|error/i.test(line) && !/status of 404/.test(line));
  if (problems.length) console.log(`console problems:\n${problems.slice(0, 8).join("\n")}`);
} finally {
  await browser.close();
}
