// M3.7 step 0 (design prototype): the non-board parts of a style tile, built
// from the real helpers (h(), CodeMirror through createEditor, icon()).
import { h } from "../src/ui/dom";
import { createEditor, setActiveLine, setErrorLine } from "../src/ui/editor";
import { icon } from "../src/ui/icons";
import { BoardView } from "../src/ui/board";
import { LEVEL } from "./sample";
import { KITS, reskin, type TileName } from "./reskin";
import {
  BISHOP, BLOB, CROWN, CROWN_MASTER, FLAG, GATE, GATE_OPEN, GATE_TIMED, GEM, KNIGHT, PAWN, PIT, PLANK, ROOK, SIGN, WAYPOINT, WAYPOINT_DONE, corruption, draw, type Sprite,
} from "./sprites";

const SVG = "http://www.w3.org/2000/svg";
const svg = (tag: string, attrs: Record<string, string | number> = {}, ...children: Element[]): SVGElement => {
  const node = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  node.append(...children);
  return node as SVGElement;
};

// -- the voice -----------------------------------------------------------------------

/** Each tile's chrome in its own voice. Teaching text (lessons, hints, errors) is never touched. */
export interface Voice {
  font: string;
  lessons: string;
  tier: string;
  chapter: (n: number, title: string) => string;
  intro: string;
  complete: string;
  lost: string;
  crumbRoot: string;
  themes: [string, string];
  menu: [string, string, string, string];
  subtitle: string;
  comingSoon: string;
  detail: string;
}

export const VOICES: Record<TileName, Voice> = {
  snes: {
    font: "Silkscreen",
    lessons: "Lessons",
    tier: "Pawn tier",
    chapter: (n, title) => `Chapter ${n} · ${title}`,
    intro: "You write the program. The pawn runs it.",
    complete: "Level cleared!",
    lost: "Run lost",
    crumbRoot: "Lessons",
    themes: ["Night shift", "Daylight terminal"],
    menu: ["Lessons", "Free Play", "Level Editor", "Settings"],
    subtitle: "rank_and_file()",
    comingSoon: "coming soon",
    detail: "Level",
  },
  neon: {
    font: "Press Start 2P",
    lessons: "// LESSONS",
    tier: "TIER 01 — PAWN",
    chapter: (n, title) => `CH.0${n} :: ${title.toUpperCase()}`,
    intro: "You are the program. Make the pawn move.",
    complete: "RUN COMPLETE",
    lost: "RUN CORRUPTED",
    crumbRoot: "LESSONS",
    themes: ["Night shift", "Daylight terminal"],
    menu: ["Lessons", "Free Play", "Level Editor", "Settings"],
    subtitle: "rank_and_file()",
    comingSoon: "soon",
    detail: "LEVEL",
  },
  terminal: {
    font: "VT323",
    lessons: "$ ls lessons/",
    tier: "pawn/  (6 chapters)",
    chapter: (n, title) => `ch0${n}_${title.toLowerCase().replaceAll(" ", "_")}/`,
    intro: "$ python pawn.py   # you write pawn.py",
    complete: "exit 0 · all checks passed",
    lost: "exit 1 · run failed",
    crumbRoot: "lessons",
    themes: ["Night shift", "Daylight terminal"],
    menu: ["lessons", "free_play", "level_editor", "settings"],
    subtitle: "rank_and_file()",
    comingSoon: "not yet built",
    detail: "level",
  },
};

// -- the sprite sheet ------------------------------------------------------------------

interface SheetItem {
  name: string;
  sprite: Sprite;
  enemy?: boolean;
  burst?: boolean; // show the glitch's burst frame, held still
}

const sheetItems = (style: TileName): SheetItem[] => {
  const kit = KITS[style];
  return [
    { name: "pawn", sprite: PAWN },
    { name: "knight skin", sprite: KNIGHT },
    { name: "rook", sprite: ROOK, enemy: true },
    { name: "bishop", sprite: BISHOP, enemy: true },
    { name: "chaser", sprite: BLOB, enemy: true },
    { name: "chaser, glitch", sprite: BLOB, enemy: true, burst: true },
    { name: "wall", sprite: kit.wall },
    { name: "sign", sprite: SIGN },
    { name: "gate", sprite: GATE },
    { name: "gate, open", sprite: GATE_OPEN },
    { name: "timed gate", sprite: GATE_TIMED },
    { name: "pit", sprite: PIT },
    { name: "plank", sprite: PLANK },
    { name: "waypoint", sprite: WAYPOINT },
    { name: "waypoint, crossed", sprite: WAYPOINT_DONE },
    { name: "gem", sprite: GEM },
    { name: "rune", sprite: kit.rune },
    { name: "goal", sprite: FLAG },
    { name: "chapter cleared", sprite: CROWN },
    { name: "mastery too", sprite: CROWN_MASTER },
  ];
};

/** One sprite on a dark and a light square, side by side, at `px` pixels a square. */
function sheetCell(item: SheetItem, style: TileName, px: number): SVGElement {
  const mode = KITS[style].mode;
  const root = svg("svg", { viewBox: "0 0 128 64", width: px * 2, height: px, class: `sheet-svg${item.burst ? " freeze" : ""}`, role: "img", "aria-label": item.name });
  [["sq-dark", 0], ["sq-light", 64]].forEach(([cls, x]) => {
    root.append(svg("rect", { x: x as number, y: 0, width: 64, height: 64, class: cls as string }));
    const group = svg("g", { transform: `translate(${x} 0)`, class: item.enemy ? "enemy" : "" });
    if (item.enemy) {
      const layers = corruption(item.sprite, 5);
      const body = svg("g", { class: "spr" });
      body.append(draw(item.sprite, mode));
      group.append(layers.fringe, layers.under, body, layers.over);
    } else {
      group.append(draw(item.sprite, mode));
    }
    root.append(group);
  });
  return root;
}

export function spriteSheet(style: TileName): HTMLElement {
  return h(
    "div",
    { class: "sheet" },
    ...sheetItems(style).map((item) =>
      h("figure", { class: "sheet-item" }, h("div", { class: "sheet-big" }, sheetCell(item, style, 64) as unknown as Node), h("div", { class: "sheet-small" }, sheetCell(item, style, 20) as unknown as Node), h("figcaption", {}, item.name)),
    ),
  );
}

// -- the code panel -----------------------------------------------------------------------

const SAMPLE_CODE = ["# warm up the pawn", "pawn.move(2)", "pawn.turn_right()", "pawn.mvoe(3)"].join("\n");

export function codeSlice(voice: Voice): { element: HTMLElement; replay: () => void } {
  const host = h("div", { class: "editor" });
  const card = h(
    "div",
    { class: "outcome outcome-bad error-card-demo" },
    h("div", { class: "outcome-head" }, h("strong", {}, voice.lost)),
    h("p", {}, h("span", { class: "line-tag" }, "line 4"), "The pawn doesn't know `mvoe`. Did you mean `move`?"),
  );
  const element = h(
    "div",
    { class: "code-slice" },
    h("div", { class: "toolbar" }, h("button", { class: "btn btn-primary btn-small" }, icon("play"), "Run"), h("button", { class: "btn btn-small", disabled: true }, "Stop"), h("span", { class: "muted small toolbar-hint" }, "Ctrl+Enter runs")),
    host,
    card,
  );
  const view = createEditor({ parent: host, code: SAMPLE_CODE, readOnly: true });
  setActiveLine(view, 3);
  setErrorLine(view, 4);
  const replay = () => {
    card.classList.remove("glitch-frame");
    card.getBoundingClientRect();
    card.classList.add("glitch-frame");
  };
  return { element, replay };
}

// -- the start menu ------------------------------------------------------------------------

export function startMenu(voice: Voice): HTMLElement {
  const items = voice.menu.map((label, i) => ({ label, soon: i === 1 || i === 2 }));
  let selected = 0;
  const note = h("p", { class: "menu-note", "aria-live": "polite" }, "↑ ↓ to choose, Enter to open");
  const list = h("ul", { class: "menu-items", role: "menu" });
  const rows = items.map((item) =>
    h(
      "li",
      { class: `menu-item${item.soon ? " soon" : ""}`, role: "menuitem", "aria-disabled": item.soon },
      h("span", { class: "menu-cursor", "aria-hidden": "true" }, "▶"),
      h("span", { class: "menu-label" }, item.label),
      item.soon ? h("span", { class: "menu-tag" }, voice.comingSoon) : null,
      // a click selects and opens, like Enter
    ),
  );
  list.append(...rows);
  const paint = () => rows.forEach((row, i) => row.classList.toggle("selected", i === selected));
  paint();
  const open = () => {
    const item = items[selected]!;
    note.textContent = item.soon ? `${item.label}: ${voice.comingSoon}` : `→ ${item.label}`;
  };
  const root = h(
    "section",
    { class: "menu-mock", tabindex: "0", "aria-label": "Start menu (use the arrow keys)" },
    h("div", { class: "menu-sky", "aria-hidden": "true" }, h("div", { class: "menu-sun" }), h("div", { class: "menu-floor" })),
    h("div", { class: "menu-body" }, h("h2", { class: "logo", "aria-label": "Rank and File" }, h("span", { class: "logo-text", "data-text": "RANK & FILE" }, "RANK & FILE")), h("p", { class: "logo-sub" }, voice.subtitle), list, note),
  );
  rows.forEach((row, i) =>
    row.addEventListener("click", () => {
      selected = i;
      paint();
      open();
    }),
  );
  root.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") selected = (selected + 1) % items.length;
    else if (event.key === "ArrowUp") selected = (selected + items.length - 1) % items.length;
    else if (event.key === "Enter") open();
    else return;
    event.preventDefault();
    paint();
  });
  return root;
}

// -- the Lessons directory ----------------------------------------------------------------------

interface Row {
  title: string;
  trains: string;
  stars?: 0 | 1 | 2 | 3;
  seen?: boolean;
  mastery?: boolean;
  next?: boolean;
}

const CHAPTER_1: Row[] = [
  { title: "First Steps", trains: "Calling a function: its name, then parentheses", stars: 3 },
  { title: "The Long Hall", trains: "Arguments: passing information into a function call", stars: 3 },
  { title: "Around the Corner", trains: "Sequencing: Python runs your lines in order, and order matters", stars: 2 },
  { title: "The Password", trains: "print() and comments", stars: 3 },
  { title: "The Winding Path", trains: "Chapter review: calls, arguments, order, print() and comments", stars: 3 },
];

const CHAPTER_2: Row[] = [
  { title: "The Surveyor's Road", trains: "Variables: give a number a name, then use the name", stars: 3 },
  { title: "Doing the Sums", trains: "A function that gives back a value, and arithmetic on it", stars: 2 },
  { title: "Halfway There", trains: "Whole-number division (//): halving what you count", seen: true, stars: 1 },
  { title: "Halt!", trains: "f-strings: putting values into text", next: true },
  { title: "Keeping Time", trains: "The remainder operator (%): working with cycles" },
  { title: "The Gauntlet", trains: "Chapter 2 mastery: counting, sums, f-strings and timing, together", mastery: true },
];

const starIcons = (n: number) => [0, 1, 2].map((i) => icon(i < n ? "star" : "starOutline"));

function pixelIcon(sprite: Sprite, style: TileName, px = 24): SVGElement {
  const root = svg("svg", { viewBox: "0 0 64 64", width: px, height: px, class: "crown-icon", "aria-hidden": "true" });
  root.append(draw(sprite, KITS[style].mode));
  return root;
}

function row(row: Row, index: number, selectable: (r: HTMLElement) => void): HTMLElement {
  const solved = (row.stars ?? 0) > 0;
  const element = h(
    "li",
    { class: `lrow${solved ? " solved" : ""}${row.next ? " selected" : ""}`, tabindex: "0" },
    h("span", { class: "lrow-num" }, solved ? "✓" : String(index + 1)),
    h("span", { class: "lrow-text" }, h("strong", {}, row.title, row.mastery ? h("span", { class: "mastery-tag" }, "Mastery · optional") : null), h("span", { class: "muted small" }, row.trains)),
    solved ? h("span", { class: "card-stars", title: `${row.stars} of 3 stars` }, ...starIcons(row.stars ?? 0)) : null,
    row.seen ? h("span", { class: "card-tag muted small" }, "Solution seen") : null,
  );
  element.addEventListener("click", () => selectable(element));
  return element;
}

function folder(options: { n: number; title: string; rows: Row[]; open: boolean; cleared?: boolean; mastered?: boolean; style: TileName; voice: Voice; select: (r: HTMLElement) => void }): HTMLElement {
  const { n, title, rows, style, voice } = options;
  const core = rows.filter((r) => !r.mastery);
  const done = core.filter((r) => (r.stars ?? 0) > 0).length;
  const segments = rows.map((r) => h("span", { class: `seg${(r.stars ?? 0) > 0 ? " on" : ""}${r.mastery ? " mastery" : ""}` }));
  const head = h(
    "button",
    { class: "folder-head", "aria-expanded": options.open ? "true" : "false" },
    h("span", { class: "folder-caret", "aria-hidden": "true" }, "▸"),
    h("span", { class: "folder-title" }, voice.chapter(n, title)),
    options.cleared
      ? h("span", { class: "victory", title: options.mastered ? "Chapter cleared, mastery done" : "Chapter cleared" }, pixelIcon(options.mastered ? CROWN_MASTER : CROWN, style), h("span", { class: "victory-label" }, options.mastered ? "mastered" : "cleared"))
      : null,
    h("span", { class: "segments", role: "img", "aria-label": `${done} of ${core.length} levels solved` }, ...segments),
  );
  const body = h("ol", { class: "lrows" }, ...rows.map((r, i) => row(r, i, options.select)));
  const element = h("div", { class: `folder${options.open ? " open" : ""}${options.cleared ? " cleared" : ""}` }, head, h("div", { class: "folder-slide" }, body));
  head.addEventListener("click", () => {
    const open = element.classList.toggle("open");
    head.setAttribute("aria-expanded", String(open));
  });
  return element;
}

export function lessonsSlice(style: TileName, voice: Voice, hybrid = false): HTMLElement {
  const detail = h("aside", { class: "detail" });
  const showDetail = (rowElement?: HTMLElement) => {
    document.querySelectorAll(".lrow.selected").forEach((r) => r.classList.remove("selected"));
    rowElement?.classList.add("selected");
    const board = new BoardView(LEVEL, { mini: true });
    reskin(board.element, LEVEL, style);
    detail.replaceChildren(
      h("p", { class: "detail-kicker" }, `${voice.detail} 2.4`),
      h("h4", {}, "Halt!"),
      h("p", { class: "muted" }, "f-strings: putting values into text"),
      h("div", { class: "detail-board" }, board.element as unknown as Node),
      h("div", { class: "detail-stars" }, "Best: ", ...starIcons(0)),
      h("div", { class: "detail-actions" }, h("button", { class: "btn btn-primary" }, icon("play"), "Run this level"), h("button", { class: "btn", disabled: true }, "Replay")),
    );
  };
  const explorer = h(
    "div",
    { class: "hud-frame" },
    h("p", { class: "tier-head" }, voice.tier),
    folder({ n: 1, title: "First Moves", rows: CHAPTER_1, open: false, cleared: true, style, voice, select: showDetail }),
    folder({ n: 2, title: "Counting Steps", rows: CHAPTER_2, open: true, style, voice, select: showDetail }),
    folder({ n: 3, title: "Marching Orders", rows: CHAPTER_1.map((r) => ({ title: r.title, trains: r.trains })), open: false, style, voice, select: showDetail }),
    h("p", { class: "tier-head" }, "Outside the curriculum"),
    folder({ n: 0, title: "Testing ground", rows: CHAPTER_1.slice(0, 2).map((r) => ({ title: r.title, trains: r.trains })), open: false, style, voice, select: showDetail }),
  );
  const crumbs = h("nav", { class: "lcrumbs", "aria-label": "Where you are" }, h("a", { href: "#" }, voice.crumbRoot), h("span", {}, "/"), h("span", {}, voice.chapter(2, "Counting Steps")));
  if (hybrid) showDetail();
  return h(
    "section",
    { class: `lessons-mock${hybrid ? " hybrid" : ""}` },
    h("h3", { class: "lessons-title" }, voice.lessons),
    crumbs,
    hybrid ? h("div", { class: "hybrid-cols" }, explorer, detail) : explorer,
  );
}
