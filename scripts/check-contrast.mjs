// The contrast check (DESIGN.md §9, M3.7): reads the colour tokens in src/styles.css and
// tests the readability rules in both themes, naming each pair that fails. Part of `npm run check`.
//
//   node scripts/check-contrast.mjs            only failures, then a summary
//   node scripts/check-contrast.mjs --all      every measurement
//
// The thresholds are the project's own rules (text 4.5 as in WCAG AA, graphics 3 as in
// WCAG 1.4.11, the rest chosen by the designer's brief), kept in one place below.
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const root = /(?:^|\n):root \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
const tokens = Object.fromEntries([...root.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));

/** Split "a, b" at the top-level comma. */
function splitTop(text) {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") depth--;
    else if (text[i] === "," && depth === 0) return [text.slice(0, i).trim(), text.slice(i + 1).trim()];
  }
  throw new Error(`not a light-dark() pair: ${text}`);
}

/** A token's value for one theme, following var() and light-dark(). */
function resolve(name, theme) {
  let value = tokens[name];
  if (value === undefined) throw new Error(`no token --${name} in :root`);
  for (let i = 0; i < 6; i++) {
    const pick = /^light-dark\((.*)\)$/s.exec(value);
    if (pick) value = splitTop(pick[1])[theme === "light" ? 0 : 1];
    const ref = /^var\(--([\w-]+)\)$/.exec(value);
    if (ref) value = tokens[ref[1]] ?? value;
  }
  return value;
}

/** [r, g, b, a] from #rgb, #rrggbb, rgb(r g b / a) or transparent. */
function parse(text) {
  if (text === "transparent") return [0, 0, 0, 0];
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16)).concat(1);
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
for (const theme of ["dark", "light"]) {
  const colour = (name) => parse(resolve(name, theme));
  const squares = { dark: colour("sq-dark"), light: colour("sq-light") };
  const bg = colour("bg");
  const test = (label, value, rule, ok) => rows.push({ theme, label, value, rule, ok });
  const atLeast = (label, value, min) => test(label, value, `≥ ${min}`, value >= min);

  // the squares: a visible step, but quiet
  const step = ratio(squares.dark, squares.light);
  test("light vs dark square", step, "1.3 to 1.6", step >= 1.3 && step <= 1.6);

  // text
  atLeast("file letters and rank numbers on the page", ratio(colour("coords"), bg), 4.5);
  atLeast("body text on the page", ratio(colour("text"), bg), 4.5);
  atLeast("muted text on the page", ratio(colour("muted"), bg), 4.5);
  atLeast("accent (headings, links) on the page", ratio(colour("accent"), bg), 4.5);
  atLeast("button text on the accent", ratio(colour("accent-text"), colour("accent")), 4.5);
  atLeast("error text on the error card", ratio(colour("bad"), colour("bad-bg")), 4.5);
  atLeast("success text on its card", ratio(colour("good"), colour("good-bg")), 4.5);
  atLeast("warning text on its card", ratio(colour("warn"), colour("warn-bg")), 4.5);
  atLeast("badge text on its badge", ratio(colour("badge-text"), colour("badge-bg")), 4.5);
  for (const syntax of ["keyword", "string", "number", "comment", "function", "definition", "class"]) {
    atLeast(`code: ${syntax} on the editor`, ratio(colour(`syn-${syntax}`), colour("code-bg")), 4.5);
  }

  // sprites stay well above the square step against both squares
  // (a wall is told apart by its area and its bricks, so it gets a lower bar than the small sprites)
  const sprites = [
    ["wall wire", "wire-wall", 2.2],
    ["gate and plank wire", "wire-amber", 3],
    ["sign and rune wire", "wire-green", 3],
    ["enemy wire", "wire-foe", 3],
    ["goal beacon", "beacon", 3],
    ["hero outline", "solid-edge", 3],
    ["hero brackets, facing side", "bracket-facing", 3],
  ];
  for (const [label, token, min] of sprites) {
    for (const square of ["dark", "light"]) atLeast(`${label} on the ${square} square`, ratio(colour(token), squares[square]), min);
  }

  // the player and the enemy differ in luminance as well as shape, so greyscale tells them apart
  atLeast("hero outline vs enemy wire (greyscale)", ratio(colour("solid-edge"), colour("wire-foe")), 1.3);

  // the grid is visible, and the halftone dots read on both squares
  for (const square of ["dark", "light"]) {
    atLeast(`grid line on the ${square} square`, ratio(over(colour("grid-line"), squares[square]), squares[square]), 1.15);
    atLeast(`halftone dot on the ${square} square`, ratio(over(colour("halftone-dot"), squares[square]), squares[square]), 1.15);
  }
  atLeast("grid tick on the dark square", ratio(over(colour("grid-tick"), squares.dark), squares.dark), 1.5);

  // glow belongs to the dark theme: the light theme's glow tokens must draw nothing
  for (const glow of ["wall", "amber", "green", "foe", "hero"]) {
    const alpha = colour(`glow-${glow}`)[3];
    test(`glow-${glow} is ${theme === "light" ? "off" : "on"}`, alpha, theme === "light" ? "= 0" : "> 0", theme === "light" ? alpha === 0 : alpha > 0);
  }
}

const failed = rows.filter((row) => !row.ok);
const show = process.argv.includes("--all") ? rows : failed;
for (const row of show) console.log(`${row.ok ? "ok  " : "FAIL"} ${row.theme.padEnd(5)} ${row.value.toFixed(2).padStart(5)} (${row.rule}) ${row.label}`);
console.log(`contrast: ${rows.length} checks, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
