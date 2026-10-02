// M3.7 step 0 (design prototype): one style tile, on the real board, in both themes.
//   /design/tiles.html?tile=snes|neon|terminal[&skin=knight][&freeze=burst][&motion=reduced]
//
// Dev-only: vite serves design/ in `npm run dev` and the production build only
// takes index.html, so none of this ships.
import "@fontsource/silkscreen/400.css";
import "@fontsource/silkscreen/700.css";
import "@fontsource/press-start-2p/400.css";
import "@fontsource/vt323/400.css";
import "../src/styles.css";
import "./tile.css";
import { BoardView } from "../src/ui/board";
import { h } from "../src/ui/dom";
import { codeSlice, lessonsSlice, spriteSheet, startMenu, VOICES } from "./chrome";
import { reskin, setHero, type Skin, type TileName } from "./reskin";
import { problems } from "./sprites";
import { EVENTS, LEVEL, STATES, state } from "./sample";

const TILES: Record<TileName, { name: string; blurb: string }> = {
  snes: { name: "1 · SNES-crisp", blurb: "Pixel-forward: 4-tone sprites, the 1px outline, almost no glow. Silkscreen." },
  neon: { name: "2 · Neon vector", blurb: "A lit outline on every sprite and more line glow, plus the explorer-and-detail Lessons hybrid. Press Start 2P." },
  terminal: { name: "3 · Terminal", blurb: "Phosphor-forward and the most code-flavoured: two-tone scanlined sprites, circuit-trace walls, >_ on runes. VT323." },
};

// A sprite row wider than 16 pixels is reported here, once, rather than thrown.
for (const problem of problems) console.error(`sprite: ${problem}`);

const params = new URLSearchParams(location.search);
const style = (params.get("tile") ?? "snes") as TileName;
if (!(style in TILES)) throw new Error(`unknown tile: ${style}`);
let skin: Skin = params.get("skin") === "knight" ? "knight" : "pawn";
const voice = VOICES[style];

const root = document.documentElement;
root.dataset.tile = style;
// The prototype's motion rules key off one attribute: reduced, unless the page says "full".
const reduced = params.get("motion") === "reduced" || (params.get("motion") !== "full" && matchMedia("(prefers-reduced-motion: reduce)").matches);
root.dataset.motion = reduced ? "reduced" : "full";
if (params.get("freeze") === "burst") root.dataset.freeze = "burst";

const boards: BoardView[] = [];

/** The real board, dressed. `mini`: the smallest size we ship (about 20px a square). */
function board(mini = false): HTMLElement {
  const view = new BoardView(LEVEL);
  reskin(view.element, LEVEL, style, skin);
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
  return h(
    "section",
    { class: "pane", "data-scheme": scheme },
    defs(scheme) as unknown as Node,
    h("p", { class: "pane-name" }, scheme === "dark" ? voice.themes[0] : voice.themes[1], h("span", { class: "muted" }, scheme === "dark" ? "  · dark" : "  · light")),
    title("The board"),
    h("div", { class: "board-row" }, board(), h("div", { class: "board-side" }, h("p", { class: "muted small" }, "Smallest board we ship: 20px squares"), board(true))),
    title("Pieces and tiles, on a dark and a light square · 64px and 20px"),
    spriteSheet(style),
    title("The code panel"),
    code.element,
    title("The start menu"),
    startMenu(voice),
    title("Lessons"),
    lessonsSlice(style, voice, style === "neon"),
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

const replays: Array<() => void> = [];

/** Run `fn` on every board: the buttons drive all of them at once. */
const all = (fn: (view: BoardView) => void) => boards.forEach(fn);

function controls(): HTMLElement {
  const button = (label: string, onClick: () => void, pressed?: boolean) => h("button", { class: "btn btn-small", onClick, ...(pressed === undefined ? {} : { "aria-pressed": String(pressed) }) }, label);
  const statesRow = Object.keys(STATES).map((name) =>
    button(name, () =>
      all((view) => {
        view.show(state(name));
      }),
    ),
  );
  const events = [
    button("bump", () => all((v) => v.animate(EVENTS.bump!, 700))),
    button("guard refuses", () => all((v) => v.animate(EVENTS.refuse!, 700))),
    button("read rune", () => all((v) => v.animate(EVENTS.read!, 700))),
    button("celebrate", () => all((v) => v.setCelebrating(true))),
    button("error card flicker", () => replays.forEach((replay) => replay())),
  ];
  const skinButton = button(`piece: ${skin}`, () => {
    skin = skin === "pawn" ? "knight" : "pawn";
    skinButton.textContent = `piece: ${skin}`;
    all((v) => setHero(v.element, skin, style));
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
    h("div", {}, h("h1", {}, TILES[style].name), h("p", { class: "muted" }, TILES[style].blurb)),
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
