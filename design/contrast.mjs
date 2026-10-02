// M3.7 step 0: an early version of the automated contrast check (DESIGN.md §9).
// Reads the style tiles' colour tokens from design/tile.css and tests the
// brief's readability rules in both themes, for each tile. Exits 1 if any fail.
//
//   node design/contrast.mjs          a table to the console
//   node design/contrast.mjs --md     the same as a Markdown table, for docs/M3/M3.7.md
//
// The step-1 version reads src/styles.css instead and joins `npm run check`.
import { readFileSync } from "node:fs";

const css = ["./tile.css", "./noir.css"].map((file) => readFileSync(new URL(file, import.meta.url), "utf8")).join("\n");

/** The declarations in the first block whose selector is exactly `selector`. */
function tokens(selector) {
  const escaped = selector.replace(/[.[\]"=*^$()|+?\\/-]/g, "\\$&");
  const block = new RegExp(`(?:^|\\n)${escaped} \\{([\\s\\S]*?)\\n\\}`).exec(css)?.[1] ?? "";
  const out = {};
  for (const [, name, value] of block.matchAll(/--([\w-]+):\s*([^;]+);/g)) out[name] = value.trim();
  return out;
}

const base = tokens(".pane");
const TILES = ["snes", "neon", "terminal", "noir"];
const overrides = Object.fromEntries(TILES.map((tile) => [tile, tokens(`[data-tile="${tile}"] .pane`)]));

/** Split "a, b" at the top-level comma (rgb() has no commas here, but keep it honest). */
function splitTop(text) {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") depth--;
    else if (text[i] === "," && depth === 0) return [text.slice(0, i).trim(), text.slice(i + 1).trim()];
  }
  return [text, text];
}

/** A token's value for one theme, following var() and light-dark(). */
function resolve(name, theme, tile) {
  const all = { ...base, ...(overrides[tile] ?? {}) };
  let value = all[name];
  if (value === undefined) throw new Error(`no token --${name}`);
  for (let i = 0; i < 6; i++) {
    const pick = /^light-dark\((.*)\)$/s.exec(value);
    if (pick) {
      const [light, dark] = splitTop(pick[1]);
      value = theme === "light" ? light : dark;
    }
    const ref = /^var\(--([\w-]+)\)$/.exec(value);
    if (ref) value = all[ref[1]] ?? value;
  }
  return value;
}

/** [r, g, b, a] from #rgb, #rrggbb or rgb(r g b / a). */
function parse(text) {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1);
  }
  const rgb = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([\d.]+))?\s*\)$/.exec(text);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])];
  throw new Error(`can't parse colour: ${text}`);
}

const over = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1);
const channel = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const rows = [];
let failed = 0;

for (const tile of TILES) {
  for (const theme of ["dark", "light"]) {
    const colour = (name) => parse(resolve(name, theme, tile));
    const bg = colour("bg");
    const squares = { dark: colour("sq-dark"), light: colour("sq-light") };
    const check = (label, value, rule, ok) => {
      if (!ok) failed++;
      rows.push({ tile, theme, label, value: value.toFixed(2), rule, ok });
    };
    const atLeast = (label, value, min) => check(label, value, `≥ ${min}`, value >= min);

    // 1. the squares: a visible step, but quiet
    const step = ratio(squares.dark, squares.light);
    check("light vs dark square", step, "1.3 to 1.6", step >= 1.3 && step <= 1.6);

    // 2. text meets normal contrast
    atLeast("file letters and rank numbers on the page", ratio(colour("coords"), bg), 4.5);
    atLeast("body text on the page", ratio(colour("text"), bg), 4.5);
    atLeast("muted text on the page", ratio(colour("muted"), bg), 4.5);
    atLeast("accent (headings, links) on the page", ratio(colour("accent"), bg), 4.5);
    atLeast("error text on the error card", ratio(colour("bad"), colour("bad-bg")), 4.5);
    atLeast("success text on its card", ratio(colour("good"), colour("good-bg")), 4.5);
    atLeast("warning text on its card", ratio(colour("warn"), colour("warn-bg")), 4.5);
    atLeast("badge text on its badge", ratio(colour("badge-text"), colour("badge-bg")), 4.5);
    for (const syntax of ["keyword", "string", "number", "comment", "function"]) {
      atLeast(`code: ${syntax} on the editor`, ratio(colour(`syn-${syntax}`), colour("code-bg")), 4.5);
    }

    // 3. sprites stay well above the square step against both squares
    // (a wall is a large block told apart by its area and texture, so it gets a lower bar than the small sprites)
    const roles = { hero: ["hero-3", 3], enemy: ["foe-3", 3], wall: ["str-3", 2.2], "gate and goal": ["amb-3", 3], "rune and sign": ["grn-3", 3] };
    for (const [role, [token, min]] of Object.entries(roles)) {
      for (const square of ["dark", "light"]) {
        atLeast(`${role} body on the ${square} square`, ratio(colour(token), squares[square]), min);
      }
    }
    // 4. the player and the enemy differ in luminance too, so greyscale tells them apart as well as shape does
    atLeast("player vs enemy body (greyscale)", ratio(colour("hero-3"), colour("foe-3")), 1.3);

    // 5. the grid is visible in greyscale, and the threat hatch reads on both squares
    for (const square of ["dark", "light"]) {
      atLeast(`grid line on the ${square} square`, ratio(over(colour("grid-line"), squares[square]), squares[square]), 1.15);
      atLeast(`threat hatch on the ${square} square`, ratio(over(colour("hatch-line"), squares[square]), squares[square]), 1.5);
    }
    atLeast("grid tick on the dark square", ratio(over(colour("grid-tick"), squares.dark), squares.dark), 1.5);

    // 6. the UI frame (not text) meets the 3:1 for components
    atLeast("HUD frame on its panel", ratio(colour("frame"), colour("panel")), 3);

    // 7. the title screen's menu (noir): its plate is see-through, so test it over the brightest sky and the floor
    if (tile === "noir") {
      for (const [where, under] of [["sky", colour("sky-4")], ["floor", colour("floor-bg")]]) {
        const plate = over(colour("plate-bg"), under);
        atLeast(`title menu text on its plate (over the ${where})`, ratio(colour("plate-text"), plate), 4.5);
        atLeast(`title menu, coming-soon text (over the ${where})`, ratio(colour("plate-muted"), plate), 4.5);
        atLeast(`title menu frame (over the ${where})`, ratio(colour("plate-accent"), plate), 3);
      }
    }
  }
}

const bad = rows.filter((row) => !row.ok);
if (process.argv.includes("--summary")) {
  // the tightest measurement for each rule, across the three tiles and both themes
  const worst = new Map();
  for (const row of rows) {
    const key = row.label.replace(/ on the (dark|light) square/, " on a square");
    const old = worst.get(key);
    if (!old || Number(row.value) < Number(old.value)) worst.set(key, row);
  }
  console.log("| Check | Rule | Tightest | Where |\n|---|---|---|---|");
  for (const [label, row] of worst) console.log(`| ${label} | ${row.rule} | ${row.value} | ${row.tile}, ${row.theme} |`);
} else if (process.argv.includes("--md")) {
  console.log("| Tile | Theme | Check | Ratio | Rule | |\n|---|---|---|---|---|---|");
  for (const row of rows.filter((r) => !r.ok || r.tile === "snes")) {
    console.log(`| ${row.tile} | ${row.theme} | ${row.label} | ${row.value} | ${row.rule} | ${row.ok ? "pass" : "**FAIL**"} |`);
  }
} else {
  for (const row of rows) console.log(`${row.ok ? "ok  " : "FAIL"} ${row.tile.padEnd(8)} ${row.theme.padEnd(5)} ${row.value.padStart(5)} (${row.rule}) ${row.label}`);
}
console.log(`\n${rows.length} checks, ${failed} failed`);
process.exit(bad.length ? 1 : 0);
