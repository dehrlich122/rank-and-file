// M5.4 (design sheet): the bishop as the player's piece, before any of it goes into the game.
//   /design/bishop.html
// Three takes (B1 Prelate, B2 Oracle, B3 Envoy), each a Model in the form of knightModel() plus its lit details. B1 was
// picked and now lives in src/ui/sprites (hero("bishop")); the sheet draws it from there. Each is shown large, at board size in all four
// facings, and on a small board beside the enemy bishop, the Charger and the pawn, in both themes.
// Dev-only; nothing here is in the game. The only new colours are tokens in bishop.css.
import "@fontsource/orbitron/500.css";
import "@fontsource/orbitron/700.css";
import "@fontsource/orbitron/900.css";
import "../src/styles.css";
import "../src/chrome.css";
import "./knight-piece.css";
import "./bishop.css";
import type { Facing } from "../src/py/protocol";
import { h } from "../src/ui/dom";
import { drawHero, enemy, hero } from "../src/ui/sprites";
import type { Decal } from "../src/ui/sprites/draw";
import { litGrid, M, S } from "../src/ui/sprites/floor";
import { lathe, yaw, type Face, type Model, type V3 } from "../src/ui/sprites/mesh";
import { onBody, SEGMENTS, type Profile } from "../src/ui/sprites/models";
import { svg } from "../src/ui/svg";

const node = (n: SVGElement) => n as unknown as Node;

// -- B2 · Oracle: a hooded figure ------------------------------------------------------------------------------------

const ORACLE: Profile = [[0, 19], [3, 19], [8, 15.4], [28, 8.4], [30, 12.6], [33, 13.2], [34, 8.4], [37, 12.4], [41, 13.8], [47, 11.2], [53, 5.6], [58, 0]];

/** A narrow robe that widens to the base, a mantle over the shoulders, and a cowl with no face under it. Faces +z. */
export function oracleModel(): Model {
  return lathe(ORACLE, SEGMENTS);
}

/** One lit slit under the cowl, and a lit seam down the back of the hood. */
export const oracleLit: Decal[] = [
  onBody(ORACLE, [[-6.5, 38.8], [6.5, 39.6], [6.5, 37.4], [-6.5, 36.6]]),
  onBody(ORACLE, [[-0.9, 53], [0.9, 53], [0.9, 36.5], [-0.9, 36.5]], true),
];

// -- B3 · Envoy: the diagonal made visible ----------------------------------------------------------------------------

const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** The four corners of the spire's base and of its tip: the tip is over to the right and toward the viewer. */
const SPIRE_BASE: V3[] = [[-11, 11, -11], [-11, 11, 11], [11, 11, 11], [11, 11, -11]];
const SPIRE_TOP: V3[] = [[3, 56, 3], [3, 56, 9], [9, 56, 9], [9, 56, 3]];

/** One side of the spire from its corners; its normal is worked out, and made to point out of the spire. */
function spireSide(i: number): { quad: V3[]; n: V3; at: (u: number, v: number) => V3 } {
  const [a, b] = [SPIRE_BASE[i]!, SPIRE_BASE[(i + 1) % 4]!];
  const [c, d] = [SPIRE_TOP[(i + 1) % 4]!, SPIRE_TOP[i]!];
  let n = cross3([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [d[0] - a[0], d[1] - a[1], d[2] - a[2]]);
  const mid = lerp3(a, c, 0.5);
  if (n[0] * mid[0] + n[2] * mid[2] < 0) n = [-n[0], -n[1], -n[2]];
  const l = Math.hypot(...n);
  return { quad: [a, b, c, d], n: [n[0] / l, n[1] / l, n[2] / l], at: (u, v) => lerp3(lerp3(a, b, u), lerp3(d, c, u), v) };
}

/** A hero-family plinth, and a four-sided spire that leans away from it along the diagonal. */
export function envoyModel(): Model {
  const plinth = lathe([[0, 19], [3.5, 19], [6, 15.5], [10, 13.5], [11, 0]], SEGMENTS);
  const faces: Face[] = [0, 1, 2, 3].map((i) => ({ pts: spireSide(i).quad, n: spireSide(i).n, part: "body" }));
  faces.push({ pts: [...SPIRE_BASE].reverse(), n: [0, -1, 0], part: "body" }, { pts: SPIRE_TOP, n: [0, 1, 0], part: "body" });
  return { faces: [...plinth.faces, ...faces], contour: [] };
}

/** One band of light across each side of the spire, from its lower corner to its far upper corner. */
export const envoyLit: Decal[] = [0, 1, 2, 3].map((i) => {
  const side = spireSide(i);
  const out = (p: V3): V3 => [p[0] + side.n[0] * 0.7, p[1] + side.n[1] * 0.7, p[2] + side.n[2] * 0.7];
  return { pts: [side.at(0, 0), side.at(0.16, 0), side.at(1, 0.84), side.at(1, 1), side.at(0.84, 1), side.at(0, 0.16)].map(out), n: side.n };
});

// -- the takes ----------------------------------------------------------------------------------------------------

interface Take {
  code: string;
  name: string;
  idea: string;
  /** B1 has none: it is the game's own hero("bishop"). The others are drawn here. */
  model?: () => Model;
  lit?: Decal[];
}

const TAKES: Take[] = [
  { code: "B1", name: "Prelate", idea: "The chess bishop made the hero's: a tall mitre with the slanted cut lit from inside, a collar, the solid body and lit eyes." },
  { code: "B2", name: "Oracle", idea: "A hooded figure: the mitre's cut becomes one lit slit under a cowl, a narrow robe that widens to the base.", model: oracleModel, lit: oracleLit },
  { code: "B3", name: "Envoy", idea: "The diagonal made visible: a faceted spire that leans, with one band of light running corner to corner across it.", model: envoyModel, lit: envoyLit },
];

// -- a take as a hero ------------------------------------------------------------------------------------------------

/** The turn that gives each facing: the front (+z) is south; east and west turn a little toward us, north away. */
const TURN: Record<Facing, number> = { south: 0, east: -Math.PI / 2 + 0.5, west: Math.PI / 2 - 0.5, north: Math.PI - 0.5 };

function bishop(take: Take, face: Facing): SVGElement {
  if (!take.model) return hero("bishop", face);
  const angle = TURN[face];
  const lit = yaw({ faces: (take.lit ?? []).map((d): Face => ({ ...d, part: "lit" })), contour: [] }, angle).faces;
  return drawHero(yaw(take.model(), angle), lit, face);
}

const FACINGS: Facing[] = ["north", "east", "south", "west"];
const label = (tag: string, text: string) => h("p", { class: "take-label" }, h("b", {}, tag), text);

/** One piece of art on a square of the board, of `size` pixels. */
const cell = (art: SVGElement, square: "sq-dark" | "sq-light", size: number) => node(svg("svg", { class: "cell", viewBox: "-32 -32 64 64", width: size, height: size, "aria-hidden": "true" }, svg("rect", { x: -32, y: -32, width: 64, height: 64, class: square }), art));

// -- pane 1: large, as the ceremony and a Skins card show it ------------------------------------------------------

function largePane(): HTMLElement {
  return h(
    "div",
    { class: "row" },
    ...TAKES.map((take) => h("figure", { class: "take" }, label(take.code, take.name), h("p", { class: "take-idea" }, take.idea), h("div", { class: "large-art" }, node(svg("svg", { viewBox: "-38 -38 76 76", width: 260, height: 260, "aria-hidden": "true" }, bishop(take, "south")))))),
  );
}

// -- pane 2: the four facings at board size ---------------------------------------------------------------------------------

function facingsPane(): HTMLElement {
  return h(
    "div",
    { class: "row" },
    ...TAKES.map((take) =>
      h(
        "figure",
        { class: "take" },
        label(take.code, take.name),
        h("div", { class: "row" }, ...FACINGS.map((face) => h("div", { class: "stack" }, h("p", { class: "facing-label" }, face), cell(bishop(take, face), "sq-dark", 128), h("div", { class: "row" }, cell(bishop(take, face), "sq-dark", 64), cell(bishop(take, face), "sq-light", 64))))),
      ),
    ),
  );
}

// -- pane 3: each take on a small board beside the enemy bishop, the Charger and the pawn ------------------------------------

const BOARD_COLS = 4;

/** A board of two rows: the pawn, the Charger, the take and the enemy bishop, facing north (upper row) and south (lower). */
function compareBoard(take: Take): SVGSVGElement {
  const el = svg("svg", { class: "compare-board", viewBox: `0 0 ${M + BOARD_COLS * S} ${2 * S}`, role: "img", "aria-label": `${take.name} beside the pawn, the Charger and the enemy bishop` });
  const at = (col: number, row: number) => `translate(${M + col * S + S / 2} ${row * S + S / 2})`;
  const squares = svg("g", { class: "squares" });
  for (let row = 0; row < 2; row++) for (let col = 0; col < BOARD_COLS; col++) squares.append(svg("rect", { x: M + col * S, y: row * S, width: S, height: S, class: (col + row) % 2 === 1 ? "sq-light" : "sq-dark" }));
  el.append(squares, litGrid(BOARD_COLS, 2));
  for (const [face, row] of [["north", 0], ["south", 1]] as const) {
    [hero("pawn", face), hero("knight", face), bishop(take, face)].forEach((art, col) => el.append(svg("g", { class: "spr", transform: at(col, row) }, art)));
    el.append(svg("g", { class: "enemy enemy-bishop", transform: at(3, row) }, enemy("bishop", "rest")));
  }
  return el;
}

function comparePane(): HTMLElement {
  return h(
    "div",
    { class: "row" },
    ...TAKES.map((take) => h("figure", { class: "take" }, label(take.code, take.name), h("p", { class: "take-idea" }, "Left to right: the pawn, the Charger, the take, the enemy bishop. Upper row faces north, lower row south."), node(compareBoard(take)))),
  );
}

// -- the sheet --------------------------------------------------------------------------------------------------------------

const pane = (scheme: "dark" | "light", name: string, ...children: HTMLElement[]) => h("div", { class: "pane", "data-scheme": scheme }, h("p", { class: "pane-name" }, name), ...children);
const both = (name: string, build: () => HTMLElement) => (["dark", "light"] as const).map((scheme) => pane(scheme, `${name} · ${scheme}`, build()));

document.getElementById("sheet")!.append(
  h(
    "header",
    { class: "sheet-head" },
    h("h1", {}, "The bishop as the piece"),
    h("p", {}, "M5.4 design sheet. At the end of the Knight tier the player is promoted from knight to bishop, and the bishop becomes a wearable skin. Choose between the labelled takes B1 to B3; each is judged in all four facings at board size, and beside the enemy bishop."),
  ),
  ...both("1 · Large", largePane),
  ...both("2 · The four facings at board size", facingsPane),
  ...both("3 · Beside the enemy bishop, the Charger and the pawn", comparePane),
);
