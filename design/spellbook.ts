// M5.2 (design sheet): Chapter 7 (Spellbook), before any of it goes into the game.
//   /design/spellbook.html
// Panes 1, 4 and 5, each in both themes (2 and 3, the examiner, come later): the stepping-stone boards, the variables
// panel while a step is inside a function, and the code panel during a call. It draws with the game's real sprites and
// classes (the Inspector, the highlighted line). Dev-only; nothing here is in the game. The only new colours are tokens
// in spellbook.css.
import "@fontsource/orbitron/500.css";
import "@fontsource/orbitron/700.css";
import "@fontsource/orbitron/900.css";
import "../src/styles.css";
import "../src/chrome.css";
import "./spellbook.css";
import type { Pos, Var } from "../src/py/protocol";
import { Inspector } from "../src/ui/panels";
import { h } from "../src/ui/dom";
import { enemy, goal, hero, tile } from "../src/ui/sprites";
import { litGrid, M, S } from "../src/ui/sprites/floor";
import { svg } from "../src/ui/svg";

const node = (n: SVGElement) => n as unknown as Node;
const tag = (id: string, text: string) => h("p", { class: "take-label" }, h("b", {}, id), text);

// -- pane 1: stepping-stone boards ------------------------------------------------------------------------------

const W = 10;
const H = 6;
// a made-up path, one stone per step: the figure "right one, up two; right one, down two" repeated
const STONES: Pos[] = [[0, 1], [1, 3], [2, 1], [3, 3], [4, 1], [5, 3], [6, 1], [7, 3], [8, 1], [9, 3]];
const WALLS: Pos[] = [[5, 2], [6, 2]]; // a two-square stretch of wall the path jumps over
const ENEMY: Pos = [6, 1];
const RUNE: Pos = [7, 3];
const KNIGHT: Pos = [3, 3]; // the fourth stone
const L_JUMPS: Pos[] = [[1, 2], [-1, 2], [2, 1], [-2, 1], [2, -1], [-2, -1], [1, -2], [-1, -2]];

const same = (a: Pos, b: Pos) => a[0] === b[0] && a[1] === b[1];
const has = (list: Pos[], p: Pos) => list.some((q) => same(q, p));
const inside = ([x, y]: Pos) => x >= 0 && x < W && y >= 0 && y < H;
const isKnightJump = (a: Pos, b: Pos) => L_JUMPS.some((j) => same([a[0] + j[0], a[1] + j[1]], b));

if (!STONES.slice(1).every((s, i) => isKnightJump(STONES[i]!, s))) throw new Error("the path has a step that is not a knight's jump");

type Chasm = "pit" | "wall";

/** Where a jump from the knight lands without an error: on the board, not in a wall (a pit is a legal, deadly landing). */
function landings(rest: Chasm): Pos[] {
  const open = (p: Pos) => !has(WALLS, p) && (rest === "pit" || has(STONES, p));
  return L_JUMPS.map((j): Pos => [KNIGHT[0] + j[0], KNIGHT[1] + j[1]]).filter((p) => inside(p) && open(p));
}

function stoneBoard(rest: Chasm): SVGSVGElement {
  const at = ([x, y]: Pos) => `translate(${M + x * S + S / 2} ${(H - 1 - y) * S + S / 2})`;
  const sprite = (cls: string, pos: Pos, art: SVGElement) => svg("g", { class: cls, transform: at(pos) }, art);
  const board = svg("svg", { class: "board", viewBox: `0 0 ${M + W * S} ${H * S}`, role: "img", "aria-label": `Stepping stones, the rest ${rest === "pit" ? "pits" : "walls"}` });
  const squares = svg("g", { class: "squares" });
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const pos: Pos = [x, y];
      squares.append(svg("rect", { x: M + x * S, y: (H - 1 - y) * S, width: S, height: S, class: (x + y) % 2 === 1 ? "sq-light" : "sq-dark" }));
      if (has(WALLS, pos) || (!has(STONES, pos) && rest === "wall")) squares.append(sprite("spr wall", pos, tile("wall")));
      else if (!has(STONES, pos)) squares.append(sprite("spr", pos, tile("pit")));
    }
  }
  squares.append(sprite("spr", RUNE, tile("rune")), sprite("spr", STONES[STONES.length - 1]!, goal()));
  const rings = landings(rest).map((p) => svg("g", { class: "land", transform: at(p) }, svg("circle", { r: 21, class: "halo" }), svg("circle", { r: 21, class: "ink" })));
  board.append(squares, litGrid(W, H), svg("g", { "aria-hidden": "true" }, ...rings));
  board.append(svg("g", { class: "enemy enemy-rook", transform: at(ENEMY) }, enemy("rook", "rest")), svg("g", { transform: at(KNIGHT) }, hero("knight", "east")));
  return board;
}

function boardPane(): HTMLElement {
  const take = (id: string, text: string, rest: Chasm, caption: string) =>
    h("figure", { class: "take" }, tag(id, text), node(stoneBoard(rest)), h("p", { class: "caption" }, caption));
  return h(
    "div",
    {},
    h("p", { class: "note" }, "A made-up board, not a level: ten stones from the start stone on the left to the goal on the right, each a knight's jump from the next (right one, up two; right one, down two, over and over). A two-square stretch of wall sits under the path, a rook stands on one stone, and one stone is a rune. The knight stands on the fourth stone; the rings are every square a jump from there could land on without an error."),
    h(
      "div",
      { class: "row" },
      take("B1", "stones over a chasm", "pit", "a wrong jump is a fall: the run is lost"),
      take("B2", "stones between walls", "wall", "a wrong jump is an error at that line"),
    ),
  );
}

// -- the sample program, for panes 4 and 5 ------------------------------------------------------------------------

const PROGRAM = ["def double(n):", "    answer = n * 2", "    return answer", "", "size = 3", "big = double(size)", "print(big)"];
const INSIDE = 2; // the running line inside the function
const CALL = 6; // the line that made the call

type Mark = "call" | "call-return";

/** The program, with the game's own class on the running line, and the call line marked as a take asks. */
function code(running: number, mark?: Mark): HTMLElement {
  const rows = PROGRAM.map((text, i) => {
    const line = i + 1;
    const classes = ["code-row", line === running ? "cm-step-line" : "", line === CALL && mark === "call" ? "call-line" : ""].join(" ");
    const gutter = line === CALL && mark === "call-return" ? h("span", { class: "gutter" }, h("span", { class: "return-mark", title: "the line that made the call" }, "↩ "), String(line)) : h("span", { class: "gutter" }, String(line));
    return h("div", { class: classes }, gutter, h("span", { class: "cm-line" }, text));
  });
  return h("div", { class: "code cm-editor" }, ...rows);
}

// -- pane 4: the variables panel inside a function ----------------------------------------------------------------

const v = (name: string, value: string, type: string): Var => ({ name, value, type });
const KNIGHT_VAR = v("knight", "at (0, 1)", "knight");
const SIZE = v("size", "3", "int");
const DOUBLE = v("double", "function double", "function");
const INSIDE_VARS = [v("n", "3", "int"), v("answer", "6", "int")];

type Moment = "a" | "b" | "c";
const MOMENTS: Record<Moment, { line: number; text: string; program: Var[] }> = {
  a: { line: CALL, text: "a · on line 6, before the call", program: [KNIGHT_VAR, SIZE, DOUBLE] },
  b: { line: INSIDE, text: "b · on line 2, inside the call", program: [KNIGHT_VAR, SIZE] },
  c: { line: 7, text: "c · on line 7, after it", program: [KNIGHT_VAR, SIZE, v("big", "6", "int")] },
};

const table = (vars: Var[]) => {
  const inspector = new Inspector("knight");
  inspector.show(vars);
  return inspector.element;
};

type Look = "V1" | "V2" | "V3";

/** The panel of one take at one moment: only moment b is inside the call. */
function variablesPanel(look: Look, moment: Moment): HTMLElement {
  const { program } = MOMENTS[moment];
  if (moment !== "b") return h("div", { class: "panel-box" }, table(program));
  if (look === "V1") {
    return h("div", { class: "panel-box" }, h("div", { class: "group" }, h("p", { class: "group-head" }, "double(3)"), table(INSIDE_VARS)), h("div", { class: "group quiet" }, h("p", { class: "group-head" }, "Your program"), table(program)));
  }
  if (look === "V2") {
    const fold = h("details", { class: "fold" }, h("summary", {}, `your program's names (${program.length})`), table(program));
    return h("div", { class: "panel-box" }, h("div", { class: "scope" }, h("p", { class: "group-head" }, "double(3)"), table(INSIDE_VARS)), fold);
  }
  return h("div", { class: "panel-box" }, h("p", { class: "context" }, "inside double(3), called from line 6"), table(INSIDE_VARS));
}

const LOOK_TEXT: Record<Look, string> = {
  V1: "two groups: the function's on top under the call, \"Your program\" below it, quieter",
  V2: "one list: the function's names with a bar down their left; the program's names folded behind one line (click it)",
  V3: "only the function's names, as Python itself says, with one line above them",
};

function variablesPane(): HTMLElement {
  const take = (look: Look) =>
    h(
      "figure",
      { class: "take" },
      tag(look, LOOK_TEXT[look]),
      h("div", { class: "row" }, ...(["a", "b", "c"] as Moment[]).map((m) => h("div", { class: "moment" }, h("p", { class: "moment-name" }, MOMENTS[m].text), code(MOMENTS[m].line), variablesPanel(look, m)))),
    );
  const listing = (id: string, text: string, vars: Var[]) => h("div", { class: "moment" }, tag(id, text), h("div", { class: "panel-box" }, table(vars)));
  return h(
    "div",
    {},
    h("p", { class: "note" }, "The game's own Inspector, three ways to show a step that is inside a function. Each take is shown at three moments; the highlighted line is the one about to run. Before the call the takes list the function among the program's names, as today (F1)."),
    h("div", { class: "row" }, ...(["V1", "V2", "V3"] as Look[]).map(take)),
    h("p", { class: "note" }, "A function the player defined, among the program's names:"),
    h("div", { class: "row" }, listing("F1", "as today: `double`, with the value \"function double\"", [KNIGHT_VAR, SIZE, DOUBLE]), listing("F2", "not listed at all", [KNIGHT_VAR, SIZE])),
  );
}

// -- pane 5: the code panel during a call ---------------------------------------------------------------------------

function codePane(): HTMLElement {
  const take = (id: string, text: string, mark?: Mark) => h("div", { class: "moment" }, tag(id, text), code(INSIDE, mark));
  const moment = (text: string, running: number, mark?: Mark) => h("div", { class: "moment" }, h("p", { class: "moment-name" }, text), code(running, mark));
  return h(
    "div",
    {},
    h("p", { class: "note" }, "The same program at the moment line 2, inside double, is running."),
    h("div", { class: "row" }, take("C1", "the usual highlight on line 2, and a quieter outlined bar on line 6, the line that made the call", "call"), take("C2", "the usual highlight on line 2, and a return-arrow mark in the gutter of line 6", "call-return"), take("C3", "the highlight on line 2 only, as the game does today")),
    h("p", { class: "note" }, "C1 over time:"),
    h(
      "figure",
      { class: "take" },
      h("div", { class: "strip" }, moment("1 · line 6 runs: the call starts", CALL), moment("2 · inside the function, line 2", INSIDE, "call"), moment("3 · the function hands back: line 6 again", CALL)),
      h("p", { class: "caption" }, "after the function ends, the highlight comes back to the line that called it"),
    ),
  );
}

// -- the sheet -------------------------------------------------------------------------------------------------------

const pane = (scheme: "dark" | "light", name: string, child: HTMLElement) => h("div", { class: "pane", "data-scheme": scheme }, h("p", { class: "pane-name" }, name), child);
const both = (name: string, build: () => HTMLElement) => (["dark", "light"] as const).map((scheme) => pane(scheme, `${name} · ${scheme}`, build()));

document.getElementById("sheet")!.append(
  h(
    "header",
    { class: "sheet-head" },
    h("h1", {}, "Chapter 7 · Spellbook"),
    h("p", {}, "M5.2 design sheet. Choose between the labelled takes: B1 or B2 (the stepping-stone boards), V1 to V3 (the variables panel inside a function) with F1 or F2 (how a function the player defined is listed), and C1 to C3 (the code panel during a call). Panes 2 and 3 (the examiner) come later."),
  ),
  ...both("1 · Stepping-stone boards", boardPane),
  ...both("4 · The variables panel inside a function", variablesPane),
  ...both("5 · The code panel during a call", codePane),
);
