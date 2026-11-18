// M5.2 (design sheet): Chapter 7 (Spellbook), before any of it goes into the game.
//   /design/spellbook.html
// Panes 1 to 5, each in both themes: the stepping-stone boards, the examiner before and after a run, the variables
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

type Chasm = "pit" | "wall";

/** Everything one stepping-stone board is drawn from: panes 1, 2 and 3 all draw through `drawBoard`. */
interface Spec {
  w: number;
  h: number;
  stones: Pos[];
  walls: Pos[];
  rest: Chasm;
  knight: Pos;
  face: "east" | "west";
  label: string;
  goalAt?: Pos;
  rune?: { at: Pos; text?: string };
  enemy?: Pos;
  rings?: Pos[];
  mini?: boolean;
}

const isPath = (stones: Pos[]) => stones.slice(1).every((s, i) => isKnightJump(stones[i]!, s));
if (!isPath(STONES)) throw new Error("the path has a step that is not a knight's jump");

/** Where a jump from the knight lands without an error: on the board, not in a wall (a pit is a legal, deadly landing). */
function landings(rest: Chasm): Pos[] {
  const open = (p: Pos) => !has(WALLS, p) && (rest === "pit" || has(STONES, p));
  return L_JUMPS.map((j): Pos => [KNIGHT[0] + j[0], KNIGHT[1] + j[1]]).filter((p) => inside(p) && open(p));
}

function drawBoard(spec: Spec): SVGSVGElement {
  const { w, h: rows, stones, walls, rest } = spec;
  const at = ([x, y]: Pos) => `translate(${M + x * S + S / 2} ${(rows - 1 - y) * S + S / 2})`;
  const sprite = (cls: string, pos: Pos, art: SVGElement) => svg("g", { class: cls, transform: at(pos) }, art);
  const board = svg("svg", { class: spec.mini ? "board board-mini" : "board", viewBox: `0 0 ${M + w * S} ${rows * S}`, role: "img", "aria-label": spec.label });
  const squares = svg("g", { class: "squares" });
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < w; x++) {
      const pos: Pos = [x, y];
      squares.append(svg("rect", { x: M + x * S, y: (rows - 1 - y) * S, width: S, height: S, class: (x + y) % 2 === 1 ? "sq-light" : "sq-dark" }));
      if (has(walls, pos) || (!has(stones, pos) && rest === "wall")) squares.append(sprite("spr wall", pos, tile("wall")));
      else if (!has(stones, pos)) squares.append(sprite("spr", pos, tile("pit")));
    }
  }
  if (spec.rune) {
    squares.append(sprite("spr", spec.rune.at, tile("rune")));
    if (spec.rune.text) squares.append(svg("text", { class: "rune-num", transform: at(spec.rune.at), "text-anchor": "middle", "dominant-baseline": "central" }, spec.rune.text));
  }
  if (spec.goalAt) squares.append(sprite("spr", spec.goalAt, goal()));
  const rings = (spec.rings ?? []).map((p) => svg("g", { class: "land", transform: at(p) }, svg("circle", { r: 21, class: "halo" }), svg("circle", { r: 21, class: "ink" })));
  board.append(squares, litGrid(w, rows), svg("g", { "aria-hidden": "true" }, ...rings));
  if (spec.enemy) board.append(svg("g", { class: "enemy enemy-rook", transform: at(spec.enemy) }, enemy("rook", "rest")));
  board.append(svg("g", { transform: at(spec.knight) }, hero("knight", spec.face)));
  return board;
}

const stoneBoard = (rest: Chasm) =>
  drawBoard({ w: W, h: H, stones: STONES, walls: WALLS, rest, knight: KNIGHT, face: "east", label: `Stepping stones, the rest ${rest === "pit" ? "pits" : "walls"}`, goalAt: STONES[STONES.length - 1]!, rune: { at: RUNE }, enemy: ENEMY, rings: landings(rest) });

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
function code(running: number, mark?: Mark, program = PROGRAM, extra: HTMLElement[] = []): HTMLElement {
  const rows = program.map((text, i) => {
    const line = i + 1;
    const classes = ["code-row", line === running ? "cm-step-line" : "", line === CALL && mark === "call" ? "call-line" : ""].join(" ");
    const gutter = line === CALL && mark === "call-return" ? h("span", { class: "gutter" }, h("span", { class: "return-mark", title: "the line that made the call" }, "↩ "), String(line)) : h("span", { class: "gutter" }, String(line));
    return h("div", { class: classes }, gutter, h("span", { class: "cm-line" }, text));
  });
  return h("div", { class: "code cm-editor" }, ...rows, ...extra);
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

// -- pane 2: the examiner before a run ------------------------------------------------------------------------------

interface Call {
  call: string;
  dir: 1 | -1;
  strides: number;
}
const GALLOPS: Call[] = [
  { call: "gallop(1, 3)", dir: 1, strides: 3 },
  { call: "gallop(-1, 2)", dir: -1, strides: 2 },
  { call: "gallop(1)", dir: 1, strides: 1 },
  { call: "gallop(-1, 4)", dir: -1, strides: 4 },
];

/** A zigzag row of stones (right one, up two; right one, down two), a stride being two jumps; the knight at the end it starts from. */
function zigzag(jumps: number, dir: 1 | -1): Pos[] {
  const stones = Array.from({ length: jumps + 1 }, (_, i): Pos => [dir === 1 ? i : jumps - i, i % 2 === 0 ? 1 : 3]);
  if (!isPath(stones)) throw new Error("the row has a step that is not a knight's jump");
  return stones;
}

function rowBoard(c: Call, opts: { mini?: boolean; rune?: string; end?: boolean } = {}): SVGSVGElement {
  const stones = zigzag(c.strides * 2, c.dir);
  const far = stones[stones.length - 1]!;
  return drawBoard({
    w: stones.length,
    h: 4,
    stones,
    walls: [],
    rest: "pit",
    knight: opts.end ? far : stones[0]!,
    face: c.dir === 1 ? "east" : "west",
    label: `The board for ${c.call}`,
    goalAt: opts.rune === undefined ? far : undefined,
    rune: opts.rune === undefined ? undefined : { at: far, text: opts.rune },
    mini: opts.mini,
  });
}

const callCode = (text: string) => h("code", { class: "call-code" }, text);

type Ask = "E1" | "E2" | "E3";

function examinerMock(ask: Ask): HTMLElement {
  const panel = h("div", { class: "challenge-box" }, h("p", { class: "box-head" }, "Challenge"));
  if (ask === "E1") panel.append(h("p", {}, "The examiner will call:"), h("ol", { class: "call-list" }, ...GALLOPS.map((c) => h("li", {}, callCode(c.call)))));
  else panel.append(h("p", {}, "The examiner calls ", callCode("gallop"), " once on each board."));
  const stage = h("div", { class: "stage" });
  const show = (picked: number) => {
    if (ask === "E3") {
      const buttons = GALLOPS.map((c, i) => h("button", { class: "btn btn-small btn-toggle", "aria-pressed": String(i === picked), onClick: () => show(i) }, c.call));
      stage.replaceChildren(h("div", { class: "case-row", role: "group", "aria-label": "Calls" }, ...buttons), node(rowBoard(GALLOPS[picked]!)));
      return;
    }
    const thumb = (c: Call, i: number) => {
      const label = h("span", { class: "board-thumb-label" }, ask === "E1" ? `Board ${i + 1}` : c.call);
      const art = node(rowBoard(c, { mini: true }));
      return h("button", { class: "btn board-thumb", title: `Look at board ${i + 1}`, onClick: () => show(i) }, ...(ask === "E1" ? [label, art] : [art, label]));
    };
    const others = GALLOPS.flatMap((c, i) => (i === picked ? [] : [thumb(c, i)]));
    const caption = ask === "E1" ? `Board ${picked + 1} of 4` : GALLOPS[picked]!.call;
    stage.replaceChildren(h("div", { class: "boards" }, h("div", { class: "boards-main" }, h("p", { class: "boards-caption" }, caption), node(rowBoard(GALLOPS[picked]!))), h("div", { class: "boards-side", role: "group", "aria-label": "The other boards" }, ...others)));
  };
  show(0);
  return h("div", { class: "mock" }, panel, stage);
}

function examinerPane(): HTMLElement {
  const take = (id: Ask, text: string) => h("figure", { class: "take" }, tag(id, text), examinerMock(id));
  return h(
    "div",
    {},
    h("p", { class: "note" }, "Made up: a function gallop(direction, strides) and four calls, one board each (a stride is two jumps along the row; the knight starts at the left end when the direction is 1, the right end when it is -1). The small boards and the buttons are clickable."),
    h("div", { class: "column" }, take("E1", "the panel lists the numbered calls; each small board carries its number"), take("E2", "the panel has one sentence; each small board carries its call as a caption"), take("E3", "buttons above the board, one per call; the picked call's board is the main board")),
  );
}

// -- pane 3: the examiner after a run -------------------------------------------------------------------------------

interface Result extends Call {
  want: string;
  got: string;
  ok: boolean;
}
const FETCHES: Result[] = [
  { call: "fetch(3)", dir: 1, strides: 3, want: "7", got: "7", ok: true },
  { call: "fetch(5)", dir: 1, strides: 5, want: "12", got: "None", ok: false },
  { call: "fetch(2)", dir: 1, strides: 2, want: "4", got: "'4'", ok: false },
  { call: "fetch(4)", dir: 1, strides: 4, want: "9", got: "9", ok: true },
];
const PICKED = 1;
const FAIL_LINE = "You showed me the number. I asked you to hand it to me.";
const FETCH_PROGRAM = ["def fetch(strides):", "    # ... the ride to the far stone ...", "    print(knight.read())"];

const tick = (ok: boolean) => (ok ? "✓" : "✗");
const examinerSays = (text: string) => h("p", { class: "examiner-line" }, h("span", { class: "examiner-mark", title: "the examiner" }, "E"), `“${text}”`);

interface After {
  buttons?: boolean;
  table?: boolean;
  voice?: "card" | "console" | "caption";
}

function resultMock(opts: After): HTMLElement {
  const r = FETCHES[PICKED]!;
  const body: HTMLElement[] = [h("p", {}, `${r.call} gave back ${r.got}. The examiner wanted ${r.want}.`)];
  if (opts.voice === "card") body.push(examinerSays(FAIL_LINE));
  if (opts.table) {
    const rows = FETCHES.map((f, i) =>
      h("tr", { class: i === PICKED ? "picked" : "" }, h("td", {}, h("button", { class: "btn btn-small", title: `Replay ${f.call}` }, f.call)), h("td", {}, f.want), h("td", {}, f.got), h("td", { class: f.ok ? "ok" : "no" }, tick(f.ok))),
    );
    body.push(h("table", { class: "calls" }, h("thead", {}, h("tr", {}, ...["call", "wanted", "got", ""].map((t) => h("th", {}, t)))), h("tbody", {}, ...rows)));
  }
  const card = h("div", { class: "outcome outcome-bad" }, h("div", { class: "outcome-head" }, h("strong", {}, "Not solved")), ...body);
  const buttons = FETCHES.map((f, i) => h("button", { class: "btn btn-small btn-toggle", "aria-pressed": String(i === PICKED) }, `${f.call} ${tick(f.ok)}`));
  const top: HTMLElement[] = opts.buttons ? [h("div", { class: "case-row", role: "group", "aria-label": "Calls" }, ...buttons)] : [];
  const caption = opts.voice === "caption" ? [h("p", { class: "boards-caption" }, FAIL_LINE)] : [];
  const consoleBox = opts.voice === "console" ? [h("pre", { class: "console" }, `${FAIL_LINE}\n`)] : [];
  return h("div", { class: "mock mock-after" }, h("div", { class: "stage" }, ...top, ...caption, node(rowBoard(r, { rune: r.want, end: true }))), h("div", { class: "side" }, card, ...consoleBox));
}

type Calling = "K1" | "K2" | "K3";

function callMoment(k: Calling): HTMLElement {
  const r = FETCHES[PICKED]!;
  const line = h("div", { class: "code-row extra-row cm-step-line" }, h("span", { class: "gutter" }, ""), h("span", { class: "cm-line" }, r.call), h("span", { class: "examiner-tag" }, "the examiner"));
  const caption = h("p", { class: "boards-caption" }, k === "K2" ? " " : `The examiner calls ${r.call}`);
  return h("div", { class: "mock mock-after" }, h("div", { class: "stage" }, caption, node(rowBoard(r, { rune: r.want }))), h("div", { class: "side" }, code(0, undefined, FETCH_PROGRAM, k === "K1" ? [] : [line])));
}

function resultPane(): HTMLElement {
  const take = (id: string, text: string, mock: HTMLElement) => h("figure", { class: "take" }, tag(id, text), mock);
  const voice = (id: string, text: string, v: After["voice"]) => take(id, text, resultMock({ buttons: true, voice: v }));
  return h(
    "div",
    {},
    h("p", { class: "note" }, "Made up: fetch(strides) rides to the far stone, a rune, and has to hand its number back. Four calls; the failed fetch(5) is picked, its board on show with the knight on the far stone."),
    h("div", { class: "column" }, take("R1", "buttons above the board with a tick or cross each; the card names the picked call", resultMock({ buttons: true })), take("R2", "no buttons; a small table in the card, one row per call, the picked row marked, each row a button", resultMock({ table: true })), take("R3", "both the buttons and the table", resultMock({ buttons: true, table: true }))),
    h("p", { class: "note" }, "Where the examiner speaks (shown on R1's layout):"),
    h("div", { class: "column" }, voice("S1", "in the result card, a quoted line under the verdict with a small mark", "card"), voice("S2", "in the console, where the gate guards' replies appear today", "console"), voice("S3", "a caption over the board when the call ends", "caption")),
    h("p", { class: "note" }, "How playback shows the examiner making its call (the player's code only defines the function). A passing call's line would be: “Correct. I had rather hoped to be disappointed.”"),
    h("div", { class: "column" }, take("K1", "a caption over the board", callMoment("K1")), take("K2", "a dimmed extra line under the code, not theirs to edit, highlighted as the calling line", callMoment("K2")), take("K3", "both", callMoment("K3"))),
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
    h("p", {}, "M5.2 design sheet. Choose between the labelled takes: B1 or B2 (the stepping-stone boards), V1 to V3 (the variables panel inside a function) with F1 or F2 (how a function the player defined is listed), and C1 to C3 (the code panel during a call), E1 to E3 (the examiner before a run), R1 to R3 with S1 to S3 and K1 to K3 (after it)."),
  ),
  ...both("1 · Stepping-stone boards", boardPane),
  ...both("2 · The examiner before a run", examinerPane),
  ...both("3 · The examiner after a run", resultPane),
  ...both("4 · The variables panel inside a function", variablesPane),
  ...both("5 · The code panel during a call", codePane),
);
