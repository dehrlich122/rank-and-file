// M4.2 step 0 (design prototype): the level editor's layout, two takes, each in both themes.
//   /design/editor.html
// Static: nothing here edits anything. It draws the real board and the real sprites around a
// sample board, to judge where things sit. Dev-only: not in the game, not in the production build.
//   Take A: palette | board | properties, the same three columns as a level (board where it is in a level).
//   Take B: one slim rail, a palette strip above the board, and the selected thing's panel beside its square.
import "@fontsource/orbitron/500.css";
import "@fontsource/orbitron/700.css";
import "@fontsource/orbitron/900.css";
import "../src/styles.css";
import "../src/chrome.css";
import "./editor.css";
import type { Pos } from "../src/py/protocol";
import { BoardView } from "../src/ui/board";
import { h } from "../src/ui/dom";
import { LEVEL } from "../src/ui/styleguideSample";
import { enemy, goal, hero, tile, type EnemyKind, type TileName } from "../src/ui/sprites";
import { M, S } from "../src/ui/sprites/floor";
import { svg } from "../src/ui/svg";

const params = new URLSearchParams(location.search);
if (params.has("still")) document.documentElement.dataset.still = "";

const node = (n: SVGElement) => n as unknown as Node;

// -- the sample draft ---------------------------------------------------------------------------------

const level = LEVEL;
const CURSOR: Pos = [3, 3]; // where the keyboard cursor is
const SIGN: Pos = level.signs[0]!.pos; // the selected square in the Square tab
const TIMED: Pos = level.timed_gates[0]!.pos; // the square with a problem
const CHASER: Pos = level.enemies[2]!.route[0]!;

const name = ([x, y]: Pos) => `${String.fromCharCode(97 + x)}${y + 1}`;
const corner = ([x, y]: Pos): [number, number] => [M + x * S, (level.height - 1 - y) * S];
const VIEW_W = M + level.width * S;
const VIEW_H = level.height * S + M;

// -- the palette --------------------------------------------------------------------------------------

interface Tool {
  label: string;
  art: () => SVGElement;
  key?: string;
  hint: string;
}

const flat = (text: string) => (): SVGElement =>
  svg("g", {}, svg("text", { x: 0, y: 12, "text-anchor": "middle", class: "pal-glyph" }, text)) as unknown as SVGElement;
const fromTile = (n: TileName) => () => tile(n);
const fromEnemy = (k: EnemyKind) => () => enemy(k, "rest" as never);

const GROUPS: Array<{ title: string; tools: Tool[] }> = [
  {
    title: "Ground",
    tools: [
      { label: "Select", art: flat("↖"), key: "1", hint: "Pick a square or enemy to edit" },
      { label: "Erase", art: flat("·"), key: "2", hint: "Back to plain floor" },
      { label: "Wall", art: fromTile("wall"), key: "3", hint: "Blocks the way" },
      { label: "Pit", art: fromTile("pit"), key: "4", hint: "Lose the run if stepped in" },
      { label: "Plank", art: fromTile("plank"), key: "5", hint: "Picked up, then bridges a pit" },
      { label: "Waypoint", art: fromTile("waypoint"), key: "6", hint: "Must be crossed" },
      { label: "Gem", art: fromTile("gem"), key: "7", hint: "Collected by walking over it" },
    ],
  },
  {
    title: "Words",
    tools: [
      { label: "Sign", art: fromTile("sign"), key: "8", hint: "Blocks; shows its words" },
      { label: "Rune", art: fromTile("rune"), key: "9", hint: "Floor you read() from" },
      { label: "Gate", art: fromTile("gate"), hint: "A guard: question and answer" },
      { label: "Timed gate", art: fromTile("gateTimed"), hint: "Opens and shuts on a clock" },
    ],
  },
  {
    title: "Start and goal",
    tools: [
      { label: "Start", art: () => hero("pawn", "north"), hint: "Where the pawn begins, and which way it faces" },
      { label: "Goal", art: () => goal(), hint: "Where the run must end" },
      { label: "Hidden goal", art: flat("?"), hint: "Squares the goal might be on" },
    ],
  },
  {
    title: "Enemies",
    tools: [
      { label: "Patrol", art: fromEnemy("chaser"), hint: "Walks a route" },
      { label: "Chaser", art: fromEnemy("chaser"), hint: "Steps toward the pawn" },
      { label: "Rook", art: fromEnemy("rook"), hint: "Stands still, attacks its lines" },
      { label: "Bishop", art: fromEnemy("bishop"), hint: "Stands still, attacks diagonals" },
    ],
  },
];

function toolButton(tool: Tool, pressed: boolean, compact: boolean): HTMLElement {
  const sprite = svg("svg", { viewBox: "-32 -32 64 64", class: "pal-sprite", "aria-hidden": "true" }, tool.art());
  return h(
    "button",
    { class: `tool${pressed ? " active" : ""}${compact ? " compact" : ""}`, "aria-pressed": String(pressed), title: `${tool.label}: ${tool.hint}${tool.key ? ` (${tool.key})` : ""}` },
    node(sprite),
    h("span", { class: "tool-name" }, tool.label),
    !compact && tool.key ? h("kbd", {}, tool.key) : null,
  );
}

function palette(compact: boolean, current: string): HTMLElement {
  return h(
    "div",
    { class: compact ? "palette palette-strip" : "palette" },
    ...GROUPS.map((group) =>
      h("section", { class: "pal-group" }, h("h3", { class: "pal-title" }, group.title), h("div", { class: "pal-tools" }, ...group.tools.map((t) => toolButton(t, t.label === current, compact)))),
    ),
  );
}

// -- the board with the editor's marks ----------------------------------------------------------------

/** The real board, plus the cursor, the selection and a problem ring on top. */
function board(selected: Pos | null): { wrap: HTMLElement; view: BoardView } {
  const view = new BoardView(level, { skin: "pawn" });
  const marks = svg("g", { class: "ed-marks" });
  const box = (pos: Pos, cls: string, inset = 3) => {
    const [x, y] = corner(pos);
    return svg("rect", { x: x + inset, y: y + inset, width: S - 2 * inset, height: S - 2 * inset, class: cls });
  };
  marks.append(box(CURSOR, "ed-cursor"));
  if (selected) {
    const [x, y] = corner(selected);
    marks.append(box(selected, "ed-selected", 2));
    // corner brackets on the selection, so it reads without colour
    const b = 12;
    marks.append(svg("path", { d: `M ${x + 2} ${y + 2 + b} V ${y + 2} H ${x + 2 + b} M ${x + S - 2 - b} ${y + 2} H ${x + S - 2} V ${y + 2 + b} M ${x + S - 2} ${y + S - 2 - b} V ${y + S - 2} H ${x + S - 2 - b} M ${x + 2 + b} ${y + S - 2} H ${x + 2} V ${y + S - 2 - b}`, class: "ed-brackets" }));
  }
  // a problem: an outline, and a "!" badge in the corner (never colour alone)
  const [px, py] = corner(TIMED);
  marks.append(box(TIMED, "ed-problem", 1), svg("circle", { cx: px + S - 10, cy: py + 10, r: 9, class: "ed-badge" }), svg("text", { x: px + S - 10, y: py + 15, "text-anchor": "middle", class: "ed-badge-mark" }, "!"));
  view.element.append(marks);
  const wrap = h("div", { class: "ed-board" }, node(view.element));
  return { wrap, view };
}

const status = (text: string) => h("p", { class: "ed-status", "aria-live": "polite" }, h("strong", {}, `${name(CURSOR)} `), text);
const keys = () => h("p", { class: "ed-keys muted small" }, "↑↓←→ move · Enter paints · 1–9 choose a tool · R turns the start · Ctrl+Z undo · Ctrl+Shift+Z redo · Esc settings");

// -- the toolbar --------------------------------------------------------------------------------------

function toolbar(): HTMLElement {
  return h(
    "div",
    { class: "toolbar ed-toolbar" },
    h("button", { class: "btn btn-small" }, "New"),
    h("button", { class: "btn btn-small" }, "Undo"),
    h("button", { class: "btn btn-small", disabled: true }, "Redo"),
    h("span", { class: "ed-sep" }),
    h("label", { class: "ed-size" }, "Size ", h("button", { class: "btn btn-small", "aria-label": "Narrower" }, "−"), h("output", {}, `${level.width}×${level.height}`), h("button", { class: "btn btn-small", "aria-label": "Wider" }, "+")),
    h("span", { class: "grow" }),
    h("span", { class: "muted small" }, "Saved in this browser"),
    h("button", { class: "btn btn-small" }, "Export"),
    h("button", { class: "btn btn-small" }, "Import"),
    h("button", { class: "btn btn-small btn-primary", disabled: true, title: `Fix the problem first: ${name(TIMED)} · timed gate` }, "Test-play"),
  );
}

// -- the properties -----------------------------------------------------------------------------------

const field = (label: string, control: HTMLElement, note?: string) => h("label", { class: "field" }, h("span", { class: "field-label" }, label), control, note ? h("span", { class: "muted small" }, note) : null);
const text = (value: string, rows = 0) => (rows ? h("textarea", { rows: String(rows), value }, value) : h("input", { type: "text", value }));

function levelFields(): HTMLElement {
  const ability = (n: string, on: boolean) => h("label", { class: "check" }, h("input", { type: "checkbox", checked: on }), h("code", {}, n));
  return h(
    "div",
    { class: "props-body" },
    field("Title", text("Cross the Courtyard")),
    field("Brief", text("Get the pawn to the beacon without stepping in the pit.", 2)),
    field("What it trains", text("Walking and turning")),
    h("fieldset", { class: "field" }, h("legend", { class: "field-label" }, "The pawn can"), h("div", { class: "checks" }, ability("move", true), ability("turn_left", true), ability("turn_right", true), ability("look", false), ability("wait", false), ability("bridge", true), ability("read", false))),
    h("div", { class: "field-row" }, field("Starts facing", h("select", {}, h("option", {}, "north"), h("option", {}, "east"))), field("Planks to start with", text("1"))),
  );
}

function squareFields(titled = true): HTMLElement {
  return h(
    "div",
    { class: "props-body" },
    titled ? h("p", { class: "props-what" }, h("strong", {}, name(SIGN)), " · Sign") : null,
    field("Words on the sign", text(level.signs[0]!.text, 3), "Shown before the run, and when the pawn walks up to it."),
    h("p", { class: "muted small" }, `A sign blocks the way, like a wall. Nothing else about it can be set.`),
  );
}

function enemyFields(): HTMLElement {
  return h(
    "div",
    { class: "props-body" },
    h("div", { class: "field-row" }, field("Kind", h("select", {}, h("option", {}, "patrol"))), field("Clock", h("select", {}, h("option", {}, "action")))),
    h("div", { class: "checks" }, h("label", { class: "check" }, h("input", { type: "checkbox" }), "Loops round"), h("label", { class: "check" }, h("input", { type: "checkbox" }), "Armoured")),
    h("p", { class: "field-label" }, "Route"),
    h("ol", { class: "route" }, h("li", {}, h("code", {}, name(CHASER)), " start"), h("li", {}, h("code", {}, "e6"), h("button", { class: "btn btn-small", "aria-label": "Remove corner e6" }, "×"))),
    h("p", { class: "muted small" }, "Click squares on the board to add corners. Straight lines along a rank or file only."),
    h("button", { class: "btn btn-small btn-primary" }, "Done drawing"),
  );
}

function problems(): HTMLElement {
  return h(
    "section",
    { class: "problems", "aria-label": "Problems" },
    h("h3", { class: "pal-title" }, "Problems (1)"),
    h("ul", {}, h("li", {}, h("button", { class: "problem-link" }, h("span", { class: "problem-badge", "aria-hidden": "true" }, "!"), h("strong", {}, `${name(TIMED)} `), "A timed gate's every must be more than its open (2), or it would never shut."))),
  );
}

function tabs(active: "Level" | "Square" | "Enemy"): HTMLElement {
  return h("div", { class: "tabs", role: "tablist" }, ...(["Level", "Square", "Enemy"] as const).map((t) => h("button", { class: `tab${t === active ? " active" : ""}`, role: "tab", "aria-selected": String(t === active) }, t)));
}

// -- the two takes ------------------------------------------------------------------------------------

function takeA(scheme: "dark" | "light", tab: "Level" | "Square"): HTMLElement {
  const { wrap } = board(SIGN);
  return h(
    "div",
    { class: "pane", "data-scheme": scheme },
    h("p", { class: "pane-name" }, `Take A · ${scheme} · ${tab} tab`),
    toolbar(),
    h(
      "div",
      { class: "ed ed-a" },
      h("aside", { class: "panel ed-left" }, palette(false, "Select")),
      h("div", { class: "ed-middle" }, wrap, status("floor · Enter selects it"), keys()),
      h("aside", { class: "panel ed-right" }, tabs(tab), tab === "Level" ? levelFields() : squareFields(), problems()),
    ),
  );
}

function takeB(scheme: "dark" | "light", what: "Square" | "Enemy"): HTMLElement {
  const target = what === "Square" ? SIGN : CHASER;
  const { wrap } = board(target);
  // the panel floats beside its square: placed by percentages of the board, so it follows the board's size
  const [x, y] = corner(target);
  const flipLeft = x + S > VIEW_W * 0.55;
  const pop = h(
    "div",
    { class: `popover ${flipLeft ? "pop-left" : "pop-right"}`, style: `left:${(((flipLeft ? x : x + S) / VIEW_W) * 100).toFixed(2)}%;top:${((y / VIEW_H) * 100).toFixed(2)}%`, role: "dialog", "aria-label": `${what} properties` },
    h("div", { class: "pop-head" }, h("strong", {}, what === "Square" ? `${name(SIGN)} · Sign` : `Enemy 3 · ${name(CHASER)}`), h("button", { class: "btn btn-small", "aria-label": "Close" }, "×")),
    what === "Square" ? squareFields(false) : enemyFields(),
  );
  wrap.append(pop);
  return h(
    "div",
    { class: "pane", "data-scheme": scheme },
    h("p", { class: "pane-name" }, `Take B · ${scheme} · ${what} popover`),
    toolbar(),
    h(
      "div",
      { class: "ed ed-b" },
      h("aside", { class: "panel ed-left" }, h("h3", { class: "pal-title" }, "Level"), levelFields(), problems()),
      h("div", { class: "ed-middle" }, palette(true, "Select"), wrap, status("floor · Enter selects it"), keys()),
    ),
  );
}

const root = document.getElementById("sheet")!;
root.append(
  h("header", { class: "sheet-head" }, h("h1", {}, "Level editor: layout"), h("p", {}, "Take A keeps the level screen's three columns (board where it is in a level). Take B gives the board more room: a palette strip above it, level settings on the left, and the selected thing's settings in a panel beside its square. Static mock-ups on the real board and sprites; the cursor is dashed, the selection has corner brackets, and a problem has an outline and a ! badge.")),
  takeA("dark", "Square"),
  takeA("light", "Level"),
  takeB("dark", "Square"),
  takeB("light", "Enemy"),
);
