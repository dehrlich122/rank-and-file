// M3.7 step 0, round 6 (design prototype): the full style sheet in the approved style.
//   /design/sheet.html  [?still holds every animation, for the screenshot] [&motion=reduced]
// A wireframe world with one solid thing in it, the hero (DESIGN.md §9). Both themes
// side by side: the title, the board with every sprite and the threats, every sprite on
// a dark and a light square, the code panel, error and success messages, the Lessons
// menu and the chrome headings. Dev-only: nothing here is in the game.
import "@fontsource/orbitron/500.css";
import "@fontsource/orbitron/700.css";
import "@fontsource/orbitron/900.css";
import "../src/styles.css";
import "./sheet.css";
import type { Facing } from "../src/py/protocol";
import { BoardView } from "../src/ui/board";
import { h } from "../src/ui/dom";
import { codeSlice, levelComplete, VOICES } from "./chrome";
import { el } from "./directions/looks";
import { EVENTS, LEVEL, STATES, state } from "./sample";
import { lessonsMenu, messages, titleScreen } from "./sheet/chrome";
import { dress, setHero } from "./sheet/dress";
import { crown, enemy, goal, hero, tile, type Skin } from "./sheet/sprites";

const params = new URLSearchParams(location.search);
const root = document.documentElement;
if (params.has("still")) root.dataset.still = "";
const reduced = params.get("motion") === "reduced" || (params.get("motion") !== "full" && matchMedia("(prefers-reduced-motion: reduce)").matches);
root.dataset.motion = reduced ? "reduced" : "full";

const voice = VOICES.noir;
const FACING: Facing = "east";
let skin: Skin = params.get("skin") === "knight" ? "knight" : "pawn";
const level = { ...LEVEL, start: { ...LEVEL.start, facing: FACING } };

const boards: BoardView[] = [];
const replays: Array<() => void> = [];
const svgNode = (node: SVGElement) => node as unknown as Node;

function board(small = false): HTMLElement {
  const view = new BoardView(level);
  dress(view.element, level, { skin, facing: FACING });
  boards.push(view);
  return h("div", { class: small ? "board-wrap board-min" : "board-wrap" }, svgNode(view.element));
}

// -- the sprite sheet ---------------------------------------------------------------------------------

/** A hidden-goal spot, as the board draws it: a dashed ring and a ?. */
const spot = () => el("g", { class: "spot" }, el("circle", { cx: 0, cy: 0, r: 23, class: "spot-ring" }), el("text", { x: 0, y: 9, "text-anchor": "middle", class: "spot-mark" }, "?"));

const SHEET: Array<[string, () => SVGElement]> = [
  ["pawn (hero)", () => hero("pawn", FACING)],
  ["knight skin", () => hero("knight", FACING)],
  ["rook", () => enemy("rook", "rest")],
  ["bishop", () => enemy("bishop", "rest")],
  ["chaser / patrol", () => enemy("chaser", "rest")],
  ["rook, mid-break", () => enemy("rook", "break")],
  ["wall", () => tile("wall")],
  ["sign", () => tile("sign")],
  ["rune", () => tile("rune")],
  ["guarded gate", () => tile("gate")],
  ["gate, open", () => tile("gateOpen")],
  ["timed gate", () => tile("gateTimed")],
  ["pit", () => tile("pit")],
  ["plank", () => tile("plank")],
  ["waypoint", () => tile("waypoint")],
  ["waypoint, crossed", () => tile("waypointDone")],
  ["gem", () => tile("gem")],
  ["goal", () => goal()],
  ["hidden goal: maybe here", spot],
  ["chapter cleared", () => crown(false)],
  ["mastery too", () => crown(true)],
];

function sheetCell(art: () => SVGElement, px: number): SVGElement {
  return el(
    "svg",
    { viewBox: "0 0 128 64", width: px * 2, height: px, class: "sheet-svg" },
    el("rect", { x: 0, y: 0, width: 64, height: 64, class: "sq-dark" }),
    el("rect", { x: 64, y: 0, width: 64, height: 64, class: "sq-light" }),
    el("g", { transform: "translate(32 32)" }, art()),
    el("g", { transform: "translate(96 32)" }, art()),
  );
}

const spriteSheet = () =>
  h("div", { class: "sheet" }, ...SHEET.map(([label, art]) => h("figure", {}, h("div", {}, svgNode(sheetCell(art, 64))), h("div", { class: "sheet-small" }, svgNode(sheetCell(art, 20))), h("figcaption", {}, label))));

// -- a pane: one theme ------------------------------------------------------------------------------------

function pane(scheme: "dark" | "light"): HTMLElement {
  const title = (text: string) => h("h3", { class: "pane-h" }, text);
  const code = codeSlice(voice);
  const complete = levelComplete(voice);
  replays.push(code.replay, complete.replay);
  return h(
    "section",
    { class: "pane", "data-scheme": scheme },
    h("p", { class: "pane-name" }, scheme === "dark" ? voice.themes[0] : voice.themes[1], h("span", { class: "muted" }, scheme === "dark" ? " · dark" : " · light")),
    title("Title"),
    titleScreen(voice, skin),
    title("The board: every sprite, the threats"),
    h("div", { class: "board-row" }, board(), h("div", { class: "board-side" }, h("p", { class: "muted small" }, "Smallest board we ship: 20px squares. The halftone switches to bigger dots."), board(true))),
    title("Sprites on a dark and a light square · 64px and 20px"),
    spriteSheet(),
    title("The code panel"),
    code.element,
    title("Error messages"),
    messages(voice),
    title("Success: the flourish plays once, then settles into the plain card"),
    complete.element,
    title("Lessons"),
    lessonsMenu(voice),
    title("Chrome headings"),
    h("div", { class: "voice" }, h("p", { class: "voice-line" }, voice.intro), h("p", { class: "voice-line" }, voice.tier), h("p", { class: "voice-line ok" }, voice.complete), h("p", { class: "voice-line bad" }, voice.lost)),
  );
}

// -- the controls -----------------------------------------------------------------------------------------

const all = (fn: (view: BoardView) => void) => boards.forEach(fn);

function controls(): HTMLElement {
  const button = (label: string, onClick: () => void, pressed?: boolean) => h("button", { class: "btn btn-small", onClick, ...(pressed === undefined ? {} : { "aria-pressed": String(pressed) }) }, label);
  const toggle = (label: string, apply: (on: boolean) => void, on = false) => {
    const element = button(label, () => {
      on = !on;
      element.setAttribute("aria-pressed", String(on));
      apply(on);
    }, on);
    return element;
  };
  const skinButton = button(`piece: ${skin}`, () => {
    skin = skin === "pawn" ? "knight" : "pawn";
    skinButton.textContent = `piece: ${skin}`;
    all((v) => setHero(v.element, skin, FACING));
    document.querySelectorAll(".ts-hero-slot").forEach((slot) => slot.replaceChildren(svgNode(el("svg", { viewBox: "-38 -38 76 76", class: "ts-hero" }, hero(skin, "south")))));
  });
  return h(
    "div",
    { class: "controls" },
    h("div", { class: "controls-row" }, h("strong", {}, "State"), ...Object.keys(STATES).map((name) => button(name, () => all((v) => v.show({ ...state(name), facing: FACING }))))),
    h(
      "div",
      { class: "controls-row" },
      h("strong", {}, "Play"),
      button("bump", () => all((v) => v.animate(EVENTS.bump!, 700))),
      button("guard refuses", () => all((v) => v.animate(EVENTS.refuse!, 700))),
      button("read rune", () => all((v) => v.animate(EVENTS.read!, 700))),
      button("error flicker + level complete", () => replays.forEach((replay) => replay())),
      skinButton,
    ),
    h(
      "div",
      { class: "controls-row" },
      h("strong", {}, "Check"),
      toggle("greyscale", (on) => document.body.classList.toggle("greyscale", on)),
      toggle("reduced motion", (on) => (root.dataset.motion = on ? "reduced" : "full"), reduced),
    ),
  );
}

document.getElementById("sheet")!.append(
  h(
    "header",
    { class: "sheet-head" },
    h("h1", {}, "Style sheet · a wire world, a solid hero"),
    h("p", {}, "Round 6: the approved style applied to the full set. The world is wireframe; the hero is the only solid thing and the only floor shadow; enemies are broken magenta wire; threatened squares are halftone dots that scale with the board; walls are clean violet wire."),
  ),
  controls(),
  h("div", { class: "panes" }, pane("dark"), pane("light")),
);
