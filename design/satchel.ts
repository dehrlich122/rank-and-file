// M5.3 (design sheet): Chapter 8 (The Satchel), before any of it goes into the game.
//   /design/satchel.html
// Pane 1 the key (K1 to K3), pane 2 the door (D1, D2), pane 3 the satchel (S1 to S3), pane 4 the two board shapes (L1,
// L2, H1), pane 5 the examiner with a list (X1 to X3, T1, T2), each in both themes. Every board is
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
import { callList } from "../src/ui/panels";
import { goal, hero, tile } from "../src/ui/sprites";
import { litGrid, M, S } from "../src/ui/sprites/floor";
import { svg } from "../src/ui/svg";

const node = (n: SVGElement) => n as unknown as Node;
const tag = (id: string, text: string) => h("p", { class: "take-label" }, h("b", {}, id), text);

// -- the made-up board: 6 by 5, stepping stones over a chasm -----------------------------------------------------------

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

/** Everything about a board's shape: panes 1 to 3 use the 6 by 5 one, pane 4 its own. */
interface Geo {
  w: number;
  h: number;
  knight: Pos;
  stones: Pos[];
  goal?: Pos;
}
const SHEET: Geo = { w: 6, h: 5, knight: KNIGHT, stones: STONES };

interface Spec {
  things: Thing[];
  label: string;
  geo?: Geo;
}

/** A jump from the knight lands where it is on the board and not a locked door (a pit is a legal, deadly landing). */
function landings(things: Thing[], { w, h: rows, knight }: Geo): Pos[] {
  const blocked = things.filter((t) => t.blocks).map((t) => t.at);
  return JUMPS.map((j): Pos => [knight[0] + j[0], knight[1] + j[1]]).filter(([x, y]) => x >= 0 && x < w && y >= 0 && y < rows && !has(blocked, [x, y]));
}

function drawBoard({ things, label, geo = SHEET }: Spec): SVGSVGElement {
  const { w: W, h: H, knight, stones } = geo;
  const at = ([x, y]: Pos) => `translate(${M + x * S + S / 2} ${(H - 1 - y) * S + S / 2})`;
  const place = (cls: string, pos: Pos, art: SVGElement) => svg("g", { class: cls, transform: at(pos) }, art);
  const cells = Array.from({ length: W * H }, (_, i): Pos => [i % W, Math.floor(i / W)]);
  const squares = svg(
    "g",
    { class: "squares" },
    ...cells.flatMap(([x, y]) => {
      const rect = svg("rect", { x: M + x * S, y: (H - 1 - y) * S, width: S, height: S, class: (x + y) % 2 === 1 ? "sq-light" : "sq-dark" });
      return has(stones, [x, y]) ? [rect] : [rect, place("spr", [x, y], tile("pit"))];
    }),
  );
  const rings = landings(things, geo).map((p) => svg("g", { class: "land", transform: at(p) }, svg("circle", { r: 21, class: "halo" }), svg("circle", { r: 21, class: "ink" })));
  const board = svg("svg", { class: "board", viewBox: `0 0 ${M + W * S} ${H * S}`, role: "img", "aria-label": label });
  if (geo.goal) squares.append(place("spr", geo.goal, goal()));
  board.append(squares, litGrid(W, H), svg("g", { "aria-hidden": "true" }, ...rings), ...things.map((t) => place("thing", t.at, t.art)));
  board.append(place("", knight, hero("knight", "east")));
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
const boardOn = (geo: Geo, label: string, ...things: Thing[]) => drawBoard({ things, label, geo });
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

// -- pane 4: the two board shapes ----------------------------------------------------------------------------------------

// The level screen at a 1440 by 900 window (src/styles.css, .level): the Learn column 29vw (418px), the code column a
// quarter wider (522px), the middle column what is left less its padding (428px), and the board's height held to
// max(240px, 100vh - 330px) (570px). A board keeps its shape, so it is drawn at the smaller of the two scales.
const SCREEN = { learn: 418, middle: 428, code: 522, maxHeight: 570 };

/** The board drawn at the size the level screen gives it: pixels across, and the pixels one square gets. */
function fitted(geo: Geo): { width: number; square: number; heldBy: string } {
  const across = M + geo.w * S;
  const down = geo.h * S;
  const byWidth = SCREEN.middle / across;
  const byHeight = SCREEN.maxHeight / down;
  const scale = Math.min(byWidth, byHeight);
  return { width: Math.round(across * scale), square: Math.round(S * scale * 10) / 10, heldBy: byHeight < byWidth ? "height" : "width" };
}

function sized(geo: Geo, label: string, ...things: Thing[]): { board: Node; note: string } {
  const board = boardOn(geo, label, ...things);
  const { width, square, heldBy } = fitted(geo);
  board.style.width = `${width}px`;
  return { board: node(board), note: `${square} px a square (the board ${width} px across, held by the ${heldBy})` };
}

/** A climb of five jumps: each two squares along `along` and one to either side of it (the sides in `sides`). */
function ladder(standing: boolean): Geo {
  const sides = [1, -1, -1, 1, 1];
  const start = 2;
  const stones = [[start, 0] as Pos];
  for (const side of sides) {
    const [x, y] = stones[stones.length - 1]!;
    stones.push([x + side, y + 2]);
  }
  const lie = (p: Pos): Pos => (standing ? p : [p[1], p[0]]);
  const placed = stones.map(lie);
  return { w: standing ? 6 : 11, h: standing ? 11 : 6, knight: placed[0]!, stones: placed, goal: placed[placed.length - 1]! };
}

/** The level screen's frame, side panels as stand-ins, the middle column holding what is given (a board, or a mock of the examiner). */
function levelFrame(...middle: Node[]): HTMLElement {
  const bars = [h("p", { class: "stub-bar" }), h("p", { class: "stub-bar" }), h("p", { class: "stub-bar short" })];
  return h("div", { class: "level-frame" }, stub("stub-learn", "Learn", ...bars), h("div", { class: "frame-mid" }, ...middle), stub("stub-code-pane", "Code", h("p", { class: "stub-code" }, "...")));
}

const LADDER_TEXT: Record<"L1" | "L2", string> = {
  L1: "the ladder standing up: each jump two squares up and one square left or right; a board 6 wide and 11 tall",
  L2: "the same ladder lying down: each jump two squares right and one square up or down; a board 11 wide and 6 tall",
};

const HUB: Geo = { w: 5, h: 5, knight: [2, 2], stones: [[2, 2], ...JUMPS.map(([dx, dy]): Pos => [2 + dx, 2 + dy])] };
const FOUR: Array<[Name, Pos]> = [["brass", [3, 4]], ["iron", [0, 1]], ["gold", [4, 1]], ["jade", [1, 0]]];
const EIGHT_KEYS: Array<[Name, Pos]> = [["3", [3, 4]], ["7", [1, 4]], ["12", [4, 3]], ["18", [0, 3]], ["21", [4, 1]], ["5", [0, 1]], ["9", [3, 0]], ["14", [1, 0]]];

function shapesPane(): HTMLElement {
  const ladderTake = (id: "L1" | "L2") => {
    const geo = ladder(id === "L1");
    const { board, note } = sized(geo, `the ${id === "L1" ? "standing" : "lying"} ladder`);
    return h("figure", { class: "take" }, tag(id, LADDER_TEXT[id]), levelFrame(board), h("p", { class: "caption" }, `At a 1440 by 900 window the level screen gives this board ${note}.`));
  };
  const hubBoard = (keys: Array<[Name, Pos]>, label: string) => {
    const { board, note } = sized(HUB, label, ...keys.map(([name, at]) => keyThing("K1", name, at)));
    return boardFigure(`${label}: ${note}`, board);
  };
  return h(
    "div",
    {},
    h("p", { class: "note" }, "Two made-up shapes of board, no code. The knight stands on the first stone, the goal is on the last, the rings are the squares a jump from the knight could land on. The level screen is drawn as the game lays it out (learn panel, board, code panel) at a 1440 by 900 window, the side panels as plain stand-ins; the board is sized as the screen sizes it: as wide as its column, but no taller than 570 px."),
    h("div", { class: "column" }, ladderTake("L1"), ladderTake("L2")),
    h("p", { class: "note" }, "The hub: a stone with the eight squares a jump away from it as stones, keys on some of them."),
    h("figure", { class: "take" }, tag("H1", "the hub, the knight on it with its eight rings; shown with four keys and with eight. The key is pane 1's take K1 (the tag), standing in for whichever key is picked"), h("div", { class: "row" }, hubBoard(FOUR, "four keys, named"), hubBoard(EIGHT_KEYS, "eight keys, numbered"))),
  );
}

// -- pane 5: the examiner with a list ------------------------------------------------------------------------------------

interface Ask {
  text: string; // the call as the level writes it
  count: number; // the items in the list it carries
  want: string; // the answer wanted
  got: string; // what the player's function gave back
  ok: boolean;
}
const ASKS: Ask[] = [
  { text: "climb([1, -1, -1, 1, 1])", count: 5, want: "[3, 5, 4, 6, 8]", got: "[3, 5, 4, 6, 8]", ok: true },
  { text: "climb([-1, -1, 1])", count: 3, want: "[2, 4]", got: "(2, 4)", ok: false },
  { text: "climb([1, 1, -1, 1])", count: 4, want: "[2, 4, 5, 7, 9]", got: "[4, 9, 2, 7, 5]", ok: false },
  { text: "visit([(2, 1), (3, 3), (5, 4), (4, 6)])", count: 4, want: "[(2, 1), (3, 3), (5, 4), (4, 6)]", got: "[(2, 1), (3, 3), (5, 4), (4, 6)]", ok: true },
];
const PICKED = 2; // after a run: the wrong list is the call on show
const callName = (a: Ask) => a.text.slice(0, a.text.indexOf("("));
const CLIP_AT = 14; // pane 5, T2: a value longer than this is clipped

const challengePanel = () =>
  h("div", { class: "tab-panel ex-panel" }, h("p", { class: "box-head" }, "Challenge"), ...callList({ function: "climb", calls: ASKS.map((a, i) => ({ text: a.text, board: i + 1 })) }, []));

type Buttons = "X1" | "X2a" | "X2b" | "X3";
const BUTTON_TEXT: Record<Buttons, (a: Ask, i: number) => string> = {
  X1: (a) => a.text,
  X2a: (a) => `${callName(a)}([…${a.count}])`,
  X2b: (_, i) => `call ${i + 1}`,
  X3: (a) => a.text,
};

function beforeRun(look: Buttons): HTMLElement {
  const buttons = ASKS.map((a, i) => h("button", { class: `btn btn-small btn-toggle${look === "X3" ? " btn-clip" : ""}`, "aria-pressed": String(i === 0), title: a.text }, BUTTON_TEXT[look](a, i)));
  const { board } = sized(ladder(false), "a stand-in board for the call on show");
  const host = h("div", { class: "board-host" }, h("div", { class: "case-row", role: "group", "aria-label": "The examiner's calls" }, ...buttons), h("p", { class: "boards-caption" }, `The examiner calls ${ASKS[0]!.text}`), board);
  return h("div", { class: "mock-ex" }, challengePanel(), host);
}

const BEFORE_TEXT: Record<Buttons, string> = {
  X1: "every call written in full: the Challenge panel, the buttons, the caption over the board",
  X2a: "the buttons shortened to the function and a count; the full call in the panel and the caption over the board (the button's tooltip carries it too)",
  X2b: "the buttons shortened to \"call 1\", \"call 2\"...; the full call in the panel and the caption (the numbers are the panel's numbers)",
  X3: "the buttons keep the call but are clipped to one width, so they sit two to a row; the full call in the panel, the caption and the tooltip",
};

const ellipsed = (text: string, full: string) => h("span", { class: "clip", title: full }, text);

/** The result card's table of calls (src/ui/panels.ts, callsTable), the long values either in full or clipped. */
function resultCard(clipped: boolean): HTMLElement {
  const picked = ASKS[PICKED]!;
  const cell = (text: string) => (clipped ? ellipsed(text, text) : text);
  const rows = ASKS.flatMap((a, i) => {
    const long = [a.text, a.want, a.got].some((t) => t.length > CLIP_AT);
    const row = h("tr", { class: i === PICKED ? "picked" : undefined }, h("td", {}, h("button", { class: `btn btn-small${clipped ? " btn-clip" : ""}`, title: `Replay ${a.text}` }, a.text)), h("td", {}, cell(a.want)), h("td", {}, cell(a.got)), h("td", { class: a.ok ? "ok" : "no" }, a.ok ? "✓" : "✗"));
    const more = h("tr", { class: "more" }, h("td", { colspan: "4" }, ...(["call", "wanted", "got"] as const).flatMap((k) => [h("span", { class: "more-key" }, k), h("span", { class: "more-val" }, k === "call" ? a.text : k === "wanted" ? a.want : a.got)])));
    return clipped && long ? [row, more] : [row];
  });
  const table = h("table", { class: `calls${clipped ? " calls-clip" : ""}` }, h("thead", {}, h("tr", {}, ...["call", "wanted", "got", ""].map((t) => h("th", {}, t)))), h("tbody", {}, ...rows));
  return h("div", { class: "outcome outcome-bad card-col" }, h("div", { class: "outcome-head" }, h("strong", {}, "Not there yet")), h("p", {}, `${picked.text} gave back ${picked.got}. The examiner wanted ${picked.want}.`), table);
}

const AFTER_TEXT = {
  T1: "the lists in full in the table, with the game's table as it is today: the call button never wraps, so wanted and got are squeezed to a character a line (this is what long values do to it)",
  T2: "long values clipped to one line; a row with a clipped value has the full call, wanted and got on a second line under it",
};

function examinerPane(): HTMLElement {
  const take = (id: string, text: string, mock: HTMLElement) => h("figure", { class: "take" }, tag(id, text), mock);
  return h(
    "div",
    {},
    h("p", { class: "note" }, "The examiner as the level screen shows it today (the Challenge panel in the Learn column, the buttons and caption above the board, the result card under it), with Chapter 8's calls: they carry lists, and the answer wanted can be a list. All made up: a function climb(jumps) and a function visit(stones). The board is a stand-in, the same for every call. At a 1440 by 900 window the Learn column is 418 px and the result card 428 px wide."),
    h("div", { class: "column" }, ...(["X1", "X2a", "X2b", "X3"] as Buttons[]).map((id) => take(id, BEFORE_TEXT[id], beforeRun(id)))),
    h("p", { class: "note" }, "After a run: the table of call, wanted and got. One call passed; one gave a list of the wrong kind ([2, 4] wanted, (2, 4) got); one gave the wrong list; one passed with a list of pairs. The wrong list is the call on show."),
    h("div", { class: "column" }, take("T1", AFTER_TEXT.T1, resultCard(false)), take("T2", AFTER_TEXT.T2, resultCard(true))),
  );
}

// -- the sheet ------------------------------------------------------------------------------------------------------------

const pane = (scheme: "dark" | "light", name: string, child: HTMLElement) => h("div", { class: "pane", "data-scheme": scheme }, h("p", { class: "pane-name" }, name), child);
const both = (name: string, build: () => HTMLElement) => (["dark", "light"] as const).map((scheme) => pane(scheme, `${name} · ${scheme}`, build()));

document.getElementById("sheet")!.append(
  h("header", { class: "sheet-head" }, h("h1", {}, "Chapter 8 · The Satchel"), h("p", {}, "M5.3 design sheet. Choose between the labelled takes: K1 to K3 (how a key carries its name), D1 or D2 (the door, locked and open), S1 to S3 (where the satchel sits and what it shows), L1 or L2 (which way the ladder board lies), H1 (the hub), X1 to X3 (the examiner's buttons before a run) and T1 or T2 (its table after one). Each pane is shown in the dark and the light theme.")),
  ...both("1 · The key", keyPane),
  ...both("2 · The door", doorPane),
  ...both("3 · The satchel", satchelPane),
  ...both("4 · The two board shapes", shapesPane),
  ...both("5 · The examiner with a list", examinerPane),
);
