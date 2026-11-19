// M5.3 (design sheet): Chapter 8 (The Satchel), before any of it goes into the game.
//   /design/satchel.html
// Pane 1 the key (K1 to K3), pane 2 the door (D1, D2), pane 3 the satchel (S1 to S3), each in both themes. Every board is
// drawn with the game's real sprites and classes on a made-up 6 by 5 board; the key, the door and the satchel are drawn
// here, in this file, because the real sprites come after the designer picks. Dev-only; nothing here is in the game.
// The only new colours are tokens in satchel.css.
import "@fontsource/orbitron/500.css";
import "@fontsource/orbitron/700.css";
import "@fontsource/orbitron/900.css";
import "../src/styles.css";
import "../src/chrome.css";
import "./satchel.css";
import type { Pos } from "../src/py/protocol";
import { h } from "../src/ui/dom";
import { hero, tile } from "../src/ui/sprites";
import { litGrid, M, S } from "../src/ui/sprites/floor";
import { svg } from "../src/ui/svg";

const node = (n: SVGElement) => n as unknown as Node;
const tag = (id: string, text: string) => h("p", { class: "take-label" }, h("b", {}, id), text);

// -- the made-up board: 6 by 5, stepping stones over a chasm -----------------------------------------------------------

const W = 6;
const H = 5;
const KNIGHT: Pos = [1, 1];
const THING: Pos = [2, 3]; // the stone a key lies on, or a door stands on: a jump from the knight
const STONES: Pos[] = [KNIGHT, THING, [0, 3], [3, 1], [4, 3], [5, 1], [3, 4], [2, 0]];
const KEY_STONE: Pos = [4, 3]; // pane 3: a second key, further on
const JUMPS: Pos[] = [[1, 2], [-1, 2], [2, 1], [-2, 1], [2, -1], [-2, -1], [1, -2], [-1, -2]];

const same = (a: Pos, b: Pos) => a[0] === b[0] && a[1] === b[1];
const has = (list: Pos[], p: Pos) => list.some((q) => same(q, p));
if (!has(JUMPS, [THING[0] - KNIGHT[0], THING[1] - KNIGHT[1]])) throw new Error("the stone is not a knight's jump away");

/** A name is short text or a whole number of one or two digits; a level uses one kind only. */
type Name = string;
const NAMED: Name = "brass";
const NUMBERED: Name = "12";

interface Thing {
  at: Pos;
  art: SVGElement;
  blocks?: boolean; // a locked door is not a landing square
}

interface Spec {
  things: Thing[];
  label: string;
}

/** A jump from the knight lands where it is on the board and not a locked door (a pit is a legal, deadly landing). */
function landings(things: Thing[]): Pos[] {
  const blocked = things.filter((t) => t.blocks).map((t) => t.at);
  return JUMPS.map((j): Pos => [KNIGHT[0] + j[0], KNIGHT[1] + j[1]]).filter(([x, y]) => x >= 0 && x < W && y >= 0 && y < H && !has(blocked, [x, y]));
}

function drawBoard({ things, label }: Spec): SVGSVGElement {
  const at = ([x, y]: Pos) => `translate(${M + x * S + S / 2} ${(H - 1 - y) * S + S / 2})`;
  const place = (cls: string, pos: Pos, art: SVGElement) => svg("g", { class: cls, transform: at(pos) }, art);
  const cells = Array.from({ length: W * H }, (_, i): Pos => [i % W, Math.floor(i / W)]);
  const squares = svg(
    "g",
    { class: "squares" },
    ...cells.flatMap(([x, y]) => {
      const rect = svg("rect", { x: M + x * S, y: (H - 1 - y) * S, width: S, height: S, class: (x + y) % 2 === 1 ? "sq-light" : "sq-dark" });
      return has(STONES, [x, y]) ? [rect] : [rect, place("spr", [x, y], tile("pit"))];
    }),
  );
  const rings = landings(things).map((p) => svg("g", { class: "land", transform: at(p) }, svg("circle", { r: 21, class: "halo" }), svg("circle", { r: 21, class: "ink" })));
  const board = svg("svg", { class: "board", viewBox: `0 0 ${M + W * S} ${H * S}`, role: "img", "aria-label": label });
  board.append(squares, litGrid(W, H), svg("g", { "aria-hidden": "true" }, ...rings), ...things.map((t) => place("thing", t.at, t.art)));
  board.append(place("", KNIGHT, hero("knight", "east")));
  return board;
}

// -- the new art, in a 64-unit square centred on (0, 0) -----------------------------------------------------------------

/** A name written to fit a width: one or two digits get bigger letters than five. */
function nameText(text: Name, x: number, y: number, width: number, extra = "", anchor = "middle", cap = 19): SVGElement {
  const size = Math.min(cap, Math.floor(width / (text.length * 0.62)));
  return svg("text", { class: `name ${extra}`, x, y, "text-anchor": anchor, "dominant-baseline": "central", style: `font-size:${size}px` }, text);
}

const line = (cls: string, d: string) => svg("path", { class: cls, d });
const rect = (cls: string, x: number, y: number, w: number, hh: number, r = 0) => svg("rect", { class: cls, x, y, width: w, height: hh, rx: r });

/** A key's shaft and teeth, hanging from (x, top) down to (x, bottom) or running right along y. */
const shaftDown = (x: number, top: number, bottom: number) => `M ${x} ${top} V ${bottom} M ${x} ${bottom - 11} H ${x + 9} M ${x} ${bottom - 3} H ${x + 6}`;
const shaftAcross = (left: number, y: number, right: number) => `M ${left} ${y} H ${right} M ${right - 11} ${y} V ${y + 8} M ${right - 3} ${y} V ${y + 6}`;

type KeyLook = "K1" | "K2" | "K3";

function keyArt(look: KeyLook, name: Name): SVGElement {
  const art = svg("g", { class: "key-art" });
  if (look === "K1") {
    // a tag on a string under the key
    art.append(
      svg("circle", { class: "k-line", cx: -17, cy: -13, r: 8 }),
      line("k-line", shaftAcross(-9, -13, 22)),
      line("k-line", "M -17 -5 Q -21 0 -20 6"),
      rect("tag", -27, 6, 54, 19, 3),
      svg("circle", { class: "k-line", cx: -21, cy: 11, r: 1.6 }),
      nameText(name, 2, 15.5, 40),
    );
  } else if (look === "K2") {
    // the name inside the key's bow
    art.append(rect("k-line bow", -26, -28, 52, 22, 11), line("k-line", shaftDown(0, -6, 25)), nameText(name, 0, -17, 40));
  } else {
    // the name on the stone's edge, set like the board's own coordinates
    art.append(svg("circle", { class: "k-line", cx: -14, cy: -8, r: 9 }), line("k-line", shaftAcross(-5, -8, 24)), line("edge-rule", "M -29 14 H 29"), nameText(name, -27, 23, 46, "edge-name", "start", 15));
  }
  return art;
}

type DoorLook = "D1" | "D2";

function doorArt(look: DoorLook, name: Name, open: boolean): SVGElement {
  const art = svg("g", { class: open ? "door-art door-open" : "door-art door-locked" });
  if (look === "D1") {
    // an arched slab, a keyhole in it, the name on a plate set across its foot
    const arch = "M -17 8 V -10 A 17 17 0 0 1 17 -10 V 8 Z";
    art.append(line(open ? "d-line d-void" : "d-line d-slab", arch));
    if (open) art.append(line("d-line d-slab", "M -17 -10 V 8 L -8 5 V -7 Z"));
    else art.append(svg("circle", { class: "k-line", cx: 0, cy: -9, r: 3.4 }), line("k-line", "M 0 -6 V 1"), line("d-grain", "M -9 -22 V 3 M 9 -22 V 3"));
    art.append(rect("tag", -27, 11, 54, 16, 3), nameText(name, 0, 19.5, 46));
  } else {
    // a square slab, a key slot in it, the name in a capsule on the lintel (the shape of a key's bow)
    art.append(rect(open ? "d-line d-void" : "d-line d-slab", -17, -8, 34, 34));
    if (open) art.append(line("d-line d-slab", "M -17 -8 V 26 L -7 22 V -4 Z"));
    else art.append(rect("k-line", -2.5, -1, 5, 17), line("k-line", "M 2.5 11 H 7"));
    art.append(rect("k-line bow", -26, -29, 52, 19, 9.5), nameText(name, 0, -19.5, 44));
  }
  return art;
}

/** A small key for the satchel: the same bow and shaft in every take, since the name is written beside it. */
const keyGlyph = () => svg("svg", { class: "glyph", viewBox: "0 0 34 20", "aria-hidden": "true" }, svg("circle", { class: "k-line", cx: 8, cy: 10, r: 6 }), line("k-line", "M 14 10 H 31 M 25 10 V 16 M 30 10 V 14"));

// -- the sheet's helpers -------------------------------------------------------------------------------------------------

const keyThing = (look: KeyLook, name: Name, at: Pos = THING): Thing => ({ at, art: keyArt(look, name) });
const doorThing = (look: DoorLook, name: Name, open: boolean): Thing => ({ at: THING, art: doorArt(look, name, open), blocks: !open });
const boardOf = (label: string, ...things: Thing[]) => node(drawBoard({ things, label }));
const boardFigure = (caption: string, board: Node) => h("div", { class: "shot" }, board, h("p", { class: "caption" }, caption));

// -- pane 1: the key ---------------------------------------------------------------------------------------------------

const KEY_TEXT: Record<KeyLook, string> = {
  K1: "a tag on a string under the key; the name is written on the tag",
  K2: "the name inside the key's bow: a wide, rounded bow that is also the label",
  K3: "the name along the stone's edge, set the way the board sets its coordinates, with a rule under the key",
};

function keyPane(): HTMLElement {
  const take = (look: KeyLook) =>
    h(
      "figure",
      { class: "take" },
      tag(look, KEY_TEXT[look]),
      h(
        "div",
        { class: "row" },
        boardFigure(`a named key, "${NAMED}"`, boardOf(`a stone with the key ${NAMED}`, keyThing(look, NAMED))),
        boardFigure(`a numbered key, ${NUMBERED}`, boardOf(`a stone with the key ${NUMBERED}`, keyThing(look, NUMBERED))),
        boardFigure("the same stone after knight.pick_up(): the stone stays, the key is gone", boardOf("the stone after the key was taken")),
      ),
    );
  return h("div", {}, h("p", { class: "note" }, "A made-up board, not a level: stepping stones over a chasm, the knight on the lower left stone and a stone with a key a jump away. The rings are the squares a jump from the knight could land on. The key is taken by standing on its stone and calling ", h("code", {}, "knight.pick_up()"), ". Each board is drawn at about 70 pixels a square."), h("div", { class: "column" }, ...(["K1", "K2", "K3"] as KeyLook[]).map(take)));
}

// -- pane 2: the door ---------------------------------------------------------------------------------------------------

const DOOR_TEXT: Record<DoorLook, string> = {
  D1: "an arched slab with a keyhole; the name on a plate across its foot. Open: the slab stands ajar over a dark doorway, the plate stays",
  D2: "a square slab with a key slot, and the name in a capsule on its lintel, the shape of the key's bow in K2. Open: the slab swings, the capsule stays",
};

function doorPane(): HTMLElement {
  const take = (look: DoorLook) => {
    const pair = (name: Name) => [false, true].map((open) => boardFigure(`${name === NAMED ? `a named door, "${name}"` : `a numbered door, ${name}`}, ${open ? "open: the knight carries the key, and the square is ringed" : "locked: no ring on it"}`, boardOf(`a ${open ? "open" : "locked"} door for ${name}`, doorThing(look, name, open))));
    return h("figure", { class: "take" }, tag(look, DOOR_TEXT[look]), h("div", { class: "grid-two" }, ...pair(NAMED), ...pair(NUMBERED)));
  };
  return h("div", {}, h("p", { class: "note" }, "The same board, a door on the stone a jump from the knight. A locked door is not a landing square, so it carries no ring; an open one is, so it does. The door stays open for as long as its key is in the satchel; it does not use the key up. The game's two gates (the guard's, the timed one) are bars between two posts; a door is a solid slab."), h("div", { class: "column" }, take("D1"), take("D2")));
}

// -- pane 3: the satchel -------------------------------------------------------------------------------------------------

type Where = "S1" | "S2" | "S3";
const CAPACITY = 8;
const TWO: Name[] = ["brass", "iron"];
const EIGHT: Name[] = ["7", "12", "3", "41", "9", "25", "16", "8"];

interface Contents {
  text: string;
  keys: Name[];
}
const STATES: Contents[] = [
  { text: "empty: the knight has picked up nothing", keys: [] },
  { text: "two keys, in the order they were picked up", keys: TWO },
  { text: "eight numbered keys: the satchel is full", keys: EIGHT },
];

/** How Python prints the list: names in quotes, numbers without. */
const printed = (keys: Name[]) => `[${keys.map((k) => (/^\d+$/.test(k) ? k : `'${k}'`)).join(", ")}]`;

function chip(name: Name, index?: number): HTMLElement {
  return h("li", { class: "chip" }, node(keyGlyph()), h("span", { class: "chip-name" }, name), ...(index === undefined ? [] : [h("span", { class: "chip-index" }, `[${index}]`)]));
}

function satchel(where: Where, keys: Name[]): HTMLElement {
  const slots = where === "S3" ? [] : Array.from({ length: CAPACITY - keys.length }, () => h("li", { class: "slot", "aria-hidden": "true" }));
  const list = h("ul", { class: `satchel satchel-${where}`, "aria-label": "The satchel" }, ...keys.map((k, i) => chip(k, where === "S3" ? i : undefined)), ...slots);
  const head = h("p", { class: "satchel-head" }, "Satchel", h("span", {}, `${keys.length} of ${CAPACITY}`));
  const parts: HTMLElement[] = [head, list];
  if (where === "S3") {
    parts.push(h("p", { class: "python" }, h("span", { class: "py-say" }, "print(knight.inventory)"), h("span", { class: "py-out" }, `${printed(keys)}`)));
  }
  return h("div", { class: `satchel-box satchel-box-${where}` }, ...parts);
}

const stub = (cls: string, title: string, ...lines: HTMLElement[]) => h("aside", { class: `stub ${cls}` }, h("p", { class: "stub-head" }, title), ...lines);
const CODE = ["knight.pick_up()", "print(knight.inventory)", '"brass" in knight.inventory'];

/** The level screen as the game lays it out (learn, board, code), the side panels as plain stand-ins, the board real. */
function frame(where: Where, keys: Name[]): HTMLElement {
  const board = boardOf("the board", ...(keys.length === 0 ? [keyThing("K2", NAMED), keyThing("K2", NUMBERED, KEY_STONE)] : []));
  const stage = h("div", { class: `stage stage-${where}` }, h("div", { class: "board-slot" }, board), satchel(where, keys));
  const codeLines = CODE.map((c) => h("p", { class: "stub-code" }, c));
  return h("div", { class: "frame" }, stub("stub-learn", "Learn", h("p", { class: "stub-bar" }), h("p", { class: "stub-bar" }), h("p", { class: "stub-bar short" })), stage, stub("stub-code-pane", "Code", ...codeLines));
}

const SATCHEL_TEXT: Record<Where, string> = {
  S1: "a strip under the board, eight slots in a row; each key beside its name, filled from the left",
  S2: "a column beside the board, eight slots one under another; a key and its name on each row",
  S3: "a strip under the board whose keys carry their place in the list ([0], [1] ...), with the list as Python prints it under them",
};

function satchelPane(): HTMLElement {
  const take = (where: Where) =>
    h("figure", { class: "take" }, tag(where, SATCHEL_TEXT[where]), h("div", { class: "row" }, ...STATES.map(({ text, keys }) => boardFigure(text, frame(where, keys)))));
  return h("div", {}, h("p", { class: "note" }, "The level screen's layout (learn panel, board, code panel) with the side panels as plain stand-ins; the board is the real drawing. The satchel belongs to the board, not to the variables panel, and is drawn from the same state as the board, so it is right at every step. In the player's code it is ", h("code", {}, "knight.inventory"), ", a list of the names in the order they were picked up. Eight slots is a made-up size, to show a full satchel."), h("div", { class: "column" }, ...(["S1", "S2", "S3"] as Where[]).map(take)));
}

// -- the sheet ------------------------------------------------------------------------------------------------------------

const pane = (scheme: "dark" | "light", name: string, child: HTMLElement) => h("div", { class: "pane", "data-scheme": scheme }, h("p", { class: "pane-name" }, name), child);
const both = (name: string, build: () => HTMLElement) => (["dark", "light"] as const).map((scheme) => pane(scheme, `${name} · ${scheme}`, build()));

document.getElementById("sheet")!.append(
  h("header", { class: "sheet-head" }, h("h1", {}, "Chapter 8 · The Satchel"), h("p", {}, "M5.3 design sheet. Choose between the labelled takes: K1 to K3 (how a key carries its name), D1 or D2 (the door, locked and open), S1 to S3 (where the satchel sits and what it shows). Each pane is shown in the dark and the light theme.")),
  ...both("1 · The key", keyPane),
  ...both("2 · The door", doorPane),
  ...both("3 · The satchel", satchelPane),
);
