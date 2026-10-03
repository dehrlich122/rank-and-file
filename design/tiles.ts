// M3.7 step 0 (design prototype): one style tile, on the real board, in both themes.
//   /design/tiles.html?tile=snes|neon|terminal|noir
//     [&sprites=pixel|vector] (noir only)  [&lessons=explorer|hybrid] (noir only)
//     [&skin=knight] [&freeze=burst] [&motion=reduced|full] [&state=run%20lost]
//
// Dev-only: vite serves design/ in `npm run dev` and the production build only
// takes index.html, so none of this ships.
import "@fontsource/silkscreen/400.css";
import "@fontsource/silkscreen/700.css";
import "@fontsource/press-start-2p/400.css";
import "@fontsource/vt323/400.css";
import "@fontsource/orbitron/500.css";
import "@fontsource/orbitron/700.css";
import "@fontsource/orbitron/900.css";
import "../src/styles.css";
import "./tile.css";
import "./noir.css";
import { BoardView } from "../src/ui/board";
import { h } from "../src/ui/dom";
import { codeSlice, lessonsSlice, levelComplete, menuHero, spriteSheet, startMenu, VOICES } from "./chrome";
import { painterFor, reskin, setHero, type Skin, type SpriteStyle, type TileName } from "./reskin";
import { problems } from "./sprites";
import { EVENTS, LEVEL, STATES, state } from "../src/ui/styleguideSample";

const TILES: Record<TileName, { name: string; blurb: string }> = {
  noir: {
    name: "4 · Neon noir",
    blurb:
      "Round 2, from neon: 80s cyberpunk after Hotline Miami, Hackers and The Lawnmower Man. Orbitron, a sunset title screen with the enemy rank before the sun, and a switch between neon pixel and vector sprites.",
  },
  snes: { name: "1 · SNES-crisp", blurb: "Round 1. Pixel-forward: 4-tone sprites, the 1px outline, almost no glow. Silkscreen." },
  neon: { name: "2 · Neon vector", blurb: "Round 1. A lit outline on every sprite and more line glow, plus the explorer-and-detail Lessons hybrid. Press Start 2P." },
  terminal: { name: "3 · Terminal", blurb: "Round 1. Phosphor-forward and the most code-flavoured: two-tone scanlined sprites, circuit-trace walls, >_ on runes. VT323." },
};

// A sprite row wider than 16 pixels is reported here, once, rather than thrown.
for (const problem of problems) console.error(`sprite: ${problem}`);

const params = new URLSearchParams(location.search);
const style = (params.get("tile") ?? "noir") as TileName;
if (!(style in TILES)) throw new Error(`unknown tile: ${style}`);
const noir = style === "noir";
const sprites: SpriteStyle = params.get("sprites") === "vector" ? "vector" : "pixel";
const hybrid = style === "neon" || (noir && params.get("lessons") !== "explorer");
let skin: Skin = params.get("skin") === "knight" ? "knight" : "pawn";
const voice = VOICES[style];
const painter = painterFor(style, sprites);

const root = document.documentElement;
root.dataset.tile = style;
root.dataset.sprites = painter.kind;
// The prototype's motion rules key off one attribute: reduced, unless the page says "full".
const reduced = params.get("motion") === "reduced" || (params.get("motion") !== "full" && matchMedia("(prefers-reduced-motion: reduce)").matches);
root.dataset.motion = reduced ? "reduced" : "full";
if (params.get("freeze") === "burst") root.dataset.freeze = "burst";

const boards: BoardView[] = [];
const replays: Array<() => void> = [];

/** The real board, dressed. `mini`: the smallest size we ship (about 20px a square). */
function board(mini = false): HTMLElement {
  const view = new BoardView(LEVEL);
  reskin(view.element, LEVEL, painter, skin);
  boards.push(view);
  return h("div", { class: mini ? "board-wrap board-min" : "board-wrap" }, view.element as unknown as Node);
}

/** A hidden <svg> that holds the pane's patterns (the hatch), so they take the pane's theme. */
const defs = (scheme: string): SVGElement => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "defs");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = `<defs><pattern id="hatch-${scheme}" patternUnits="userSpaceOnUse" width="12" height="12" patternTransform="rotate(45)">
    <rect width="12" height="12" fill="var(--hatch-base)"/><rect width="2.5" height="12" fill="var(--hatch-line)"/></pattern></defs>`;
  return svg;
};

function pane(scheme: "dark" | "light"): HTMLElement {
  const code = codeSlice(voice);
  replays.push(code.replay);
  const title = (text: string) => h("h3", { class: "pane-h" }, text);
  const menu = [title("The start menu"), startMenu(voice, noir ? { painter, skin } : undefined)];
  const complete = noir ? levelComplete(voice) : undefined;
  if (complete) replays.push(complete.replay);
  return h(
    "section",
    { class: "pane", "data-scheme": scheme },
    defs(scheme) as unknown as Node,
    h("p", { class: "pane-name" }, scheme === "dark" ? voice.themes[0] : voice.themes[1], h("span", { class: "muted" }, scheme === "dark" ? "  · dark" : "  · light")),
    ...(noir ? menu : []),
    title("The board"),
    h("div", { class: "board-row" }, board(), h("div", { class: "board-side" }, h("p", { class: "muted small" }, "Smallest board we ship: 20px squares"), board(true))),
    title("Pieces and tiles, on a dark and a light square · 64px and 20px"),
    spriteSheet(painter),
    title("The code panel"),
    code.element,
    ...(complete ? [title("Level complete: the flourish plays once, then settles into the plain card"), complete.element] : []),
    ...(noir ? [] : menu),
    title("Lessons"),
    lessonsSlice(painter, voice, hybrid),
    title("Chrome headings in this voice"),
    h(
      "div",
      { class: "voice" },
      h("p", { class: "voice-line" }, voice.intro),
      h("p", { class: "voice-line ok" }, voice.complete),
      h("p", { class: "voice-line bad" }, voice.lost),
    ),
  );
}

/** Run `fn` on every board: the buttons drive all of them at once. */
const all = (fn: (view: BoardView) => void) => boards.forEach(fn);

/** This page's address with some parameters changed (the switches that rebuild the page). */
function withParams(changes: Record<string, string>): string {
  const next = new URLSearchParams(location.search);
  for (const [name, value] of Object.entries(changes)) next.set(name, value);
  return `?${next}`;
}

function controls(): HTMLElement {
  const button = (label: string, onClick: () => void, pressed?: boolean) => h("button", { class: "btn btn-small", onClick, ...(pressed === undefined ? {} : { "aria-pressed": String(pressed) }) }, label);
  const link = (label: string, href: string, current: boolean) => h("a", { class: "btn btn-small", href, "aria-pressed": String(current) }, label);
  const statesRow = Object.keys(STATES).map((name) => button(name, () => all((view) => view.show(state(name)))));
  const events = [
    button("bump", () => all((v) => v.animate(EVENTS.bump!, 700))),
    button("guard refuses", () => all((v) => v.animate(EVENTS.refuse!, 700))),
    button("read rune", () => all((v) => v.animate(EVENTS.read!, 700))),
    button("celebrate", () => all((v) => v.setCelebrating(true))),
    button(noir ? "error flicker + level complete" : "error card flicker", () => replays.forEach((replay) => replay())),
  ];
  const skinButton = button(`piece: ${skin}`, () => {
    skin = skin === "pawn" ? "knight" : "pawn";
    skinButton.textContent = `piece: ${skin}`;
    all((v) => setHero(v.element, skin, painter));
    // the title screen's hero is the rank the player has reached
    document.querySelectorAll(".menu-hero-slot").forEach((slot) => slot.replaceChildren(menuHero(painter, skin)));
  });
  const toggle = (label: string, apply: (on: boolean) => void) => {
    let on = false;
    const element = button(label, () => {
      on = !on;
      element.setAttribute("aria-pressed", String(on));
      apply(on);
    }, false);
    return element;
  };
  return h(
    "div",
    { class: "controls" },
    noir
      ? h(
          "div",
          { class: "controls-row" },
          h("strong", {}, "Style"),
          link("pixel sprites", withParams({ sprites: "pixel" }), sprites === "pixel"),
          link("vector sprites", withParams({ sprites: "vector" }), sprites === "vector"),
          h("span", { class: "controls-gap" }),
          link("lessons: explorer + detail", withParams({ lessons: "hybrid" }), hybrid),
          link("lessons: explorer only", withParams({ lessons: "explorer" }), !hybrid),
        )
      : null,
    h("div", { class: "controls-row" }, h("strong", {}, "State"), ...statesRow),
    h("div", { class: "controls-row" }, h("strong", {}, "Play"), ...events, skinButton),
    h(
      "div",
      { class: "controls-row" },
      h("strong", {}, "Check"),
      toggle("greyscale", (on) => document.body.classList.toggle("greyscale", on)),
      toggle("reduced motion", (on) => (root.dataset.motion = on ? "reduced" : "full")),
      toggle("freeze glitch burst", (on) => (on ? (root.dataset.freeze = "burst") : delete root.dataset.freeze)),
      toggle("scanlines (CRT)", (on) => document.body.classList.toggle("crt", on)),
    ),
  );
}

const app = document.getElementById("tile")!;
app.append(
  h(
    "header",
    { class: "tile-head" },
    h("div", {}, h("h1", {}, TILES[style].name, noir ? h("span", { class: "tile-sub" }, ` · ${sprites} sprites`) : null), h("p", { class: "muted" }, TILES[style].blurb)),
    h(
      "nav",
      { class: "tile-nav" },
      h("a", { href: "./index.html" }, "All tiles"),
      ...(Object.keys(TILES) as TileName[]).map((name) => h("a", { href: `?tile=${name}`, "aria-current": name === style ? "page" : undefined }, TILES[name].name)),
    ),
  ),
  controls(),
  h("div", { class: "panes" }, pane("dark"), pane("light")),
);
// Held-still states for screenshots: ?state=run%20lost
const initial = params.get("state");
if (initial && initial in STATES) all((view) => view.show(state(initial)));
document.title = `${TILES[style].name} · style tile`;
