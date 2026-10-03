// M3.7 step 0 (design prototype): the non-board parts of a style tile, built
// from the real helpers (h(), CodeMirror through createEditor, icon()).
import { h } from "../src/ui/dom";
import { createEditor, setActiveLine, setErrorLine } from "../src/ui/editor";
import { icon } from "../src/ui/icons";
import { BoardView } from "../src/ui/board";
import { LEVEL } from "../src/ui/styleguideSample";
import { corrupted, reskin, type Skin, type TileName } from "./reskin";
import { hero, type Painter, type SpriteName } from "./paint";

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
  lessons: string;
  tier: string;
  chapter: (n: number, title: string) => string;
  outside: string;
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

const plainChapter = (n: number, title: string) => (n ? `Chapter ${n} · ${title}` : title);

export const VOICES: Record<TileName, Voice> = {
  snes: {
    lessons: "Lessons",
    tier: "Pawn tier",
    chapter: plainChapter,
    outside: "Outside the curriculum",
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
    lessons: "// LESSONS",
    tier: "TIER 01 — PAWN",
    chapter: (n, title) => (n ? `CH.0${n} :: ${title.toUpperCase()}` : title.toUpperCase()),
    outside: "Outside the curriculum",
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
    lessons: "$ ls lessons/",
    tier: "pawn/  (6 chapters)",
    chapter: (n, title) => `${n ? `ch0${n}_` : ""}${title.toLowerCase().replaceAll(" ", "_")}/`,
    outside: "Outside the curriculum",
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
  noir: {
    lessons: "Lessons",
    tier: "Tier 1 · Pawn",
    chapter: (n, title) => (n ? `0${n} · ${title}` : title),
    outside: "Off the grid",
    intro: "You write the program. The pawn runs it.",
    complete: "Run complete",
    lost: "Run lost",
    crumbRoot: "Lessons",
    themes: ["Night shift", "Daylight terminal"],
    menu: ["Lessons", "Free Play", "Level Editor", "Settings"],
    subtitle: "rank_and_file()",
    comingSoon: "coming soon",
    detail: "Level 2.4",
  },
};

// -- the sprite sheet ------------------------------------------------------------------

interface SheetItem {
  label: string;
  name: SpriteName;
  enemy?: boolean;
  burst?: boolean; // show the glitch's burst frame, held still
}

const SHEET: SheetItem[] = [
  { label: "pawn", name: "pawn" },
  { label: "knight skin", name: "knight" },
  { label: "rook", name: "rook", enemy: true },
  { label: "bishop", name: "bishop", enemy: true },
  { label: "chaser", name: "blob", enemy: true },
  { label: "chaser, glitch", name: "blob", enemy: true, burst: true },
  { label: "wall", name: "wall" },
  { label: "sign", name: "sign" },
  { label: "gate", name: "gate" },
  { label: "gate, open", name: "gateOpen" },
  { label: "timed gate", name: "gateTimed" },
  { label: "pit", name: "pit" },
  { label: "plank", name: "plank" },
  { label: "waypoint", name: "waypoint" },
  { label: "waypoint, crossed", name: "waypointDone" },
  { label: "gem", name: "gem" },
  { label: "rune", name: "rune" },
  { label: "goal", name: "flag" },
  { label: "chapter cleared", name: "crown" },
  { label: "mastery too", name: "crownMaster" },
];

/** One sprite on a dark and a light square, side by side, at `px` pixels a square. */
function sheetCell(item: SheetItem, painter: Painter, px: number): SVGElement {
  const root = svg("svg", { viewBox: "0 0 128 64", width: px * 2, height: px, class: `sheet-svg sprites-${painter.kind}${item.burst ? " freeze" : ""}`, role: "img", "aria-label": item.label });
  [["sq-dark", 0], ["sq-light", 64]].forEach(([cls, x]) => {
    root.append(svg("rect", { x: x as number, y: 0, width: 64, height: 64, class: cls as string }));
    if (item.enemy) {
      root.append(corrupted(painter, item.name, 5, svg("g", { transform: `translate(${(x as number) + 32} 32)`, class: "enemy" }) as SVGGElement));
    } else {
      root.append(svg("g", { transform: `translate(${x} 0)` }, painter.draw(item.name)));
    }
  });
  return root;
}

export function spriteSheet(painter: Painter): HTMLElement {
  return h(
    "div",
    { class: "sheet" },
    ...SHEET.map((item) =>
      h(
        "figure",
        { class: "sheet-item" },
        h("div", { class: "sheet-big" }, sheetCell(item, painter, 64) as unknown as Node),
        h("div", { class: "sheet-small" }, sheetCell(item, painter, 20) as unknown as Node),
        h("figcaption", {}, item.label),
      ),
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

// The enemy rank before the sun (round 2): a chess back rank of rooks and bishops.
const RANK: SpriteName[] = ["rook", "bishop", "rook", "bishop", "bishop", "rook", "bishop", "rook"];

/** The enemy rank, silhouetted against the sun with a lit rim, glitching now and then. */
function enemyRank(painter: Painter): SVGElement {
  const root = svg("svg", { viewBox: `0 0 ${RANK.length * 64} 66`, class: `menu-rank sprites-${painter.kind}`, "aria-hidden": "true" });
  RANK.forEach((name, i) => {
    const piece = corrupted(painter, name, 3 + i * 5, svg("g", { class: "enemy rank-piece", transform: `translate(${i * 64 + 32} 33)` }) as SVGGElement);
    // the sprite becomes a silhouette: a rim of light from the sun, then the dark shape over it
    const body = piece.querySelector(".spr")!;
    body.replaceChildren(
      svg("g", { transform: "translate(-32 -32)" }, painter.draw(name, { flat: "var(--title-rim)", dy: -3 })),
      svg("g", { transform: "translate(-32 -32)" }, painter.draw(name, { flat: "var(--title-silhouette)" })),
    );
    (piece as SVGGElement).style.setProperty("--glitch-delay", `${(i * 1.3) % 5}s`);
    root.append(piece);
  });
  return root;
}

/** The player's hero at the rank they've reached, standing on the grid under the menu. */
export function menuHero(painter: Painter, skin: Skin): SVGElement {
  return svg(
    "svg",
    { viewBox: "-40 -40 80 80", class: `menu-hero sprites-${painter.kind}`, role: "img", "aria-label": `Your piece: the ${skin}` },
    svg("ellipse", { cx: 0, cy: 29, rx: 24, ry: 5, class: "menu-hero-shadow" }),
    hero(painter, skin),
  );
}

export function startMenu(voice: Voice, scene?: { painter: Painter; skin: Skin }): HTMLElement {
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
    ),
  );
  list.append(...rows);
  const paint = () => rows.forEach((row, i) => row.classList.toggle("selected", i === selected));
  paint();
  const open = () => {
    const item = items[selected]!;
    note.textContent = item.soon ? `${item.label}: ${voice.comingSoon}` : `→ ${item.label}`;
  };
  const sky = h(
    "div",
    { class: "menu-sky", "aria-hidden": "true" },
    h("div", { class: "menu-sun" }),
    scene ? (enemyRank(scene.painter) as unknown as Node) : null,
    h("div", { class: "menu-floor" }),
    scene ? h("div", { class: "menu-vhs" }) : null,
  );
  const root = h(
    "section",
    { class: `menu-mock${scene ? " scene" : ""}`, tabindex: "0", "aria-label": "Start menu (use the arrow keys)" },
    sky,
    h(
      "div",
      { class: "menu-body" },
      h("h2", { class: "logo", "aria-label": "Rank and File" }, h("span", { class: "logo-text", "data-text": "RANK & FILE" }, "RANK & FILE")),
      h("p", { class: "logo-sub" }, voice.subtitle),
      list,
      note,
      scene ? h("div", { class: "menu-hero-slot" }, menuHero(scene.painter, scene.skin) as unknown as Node) : null,
    ),
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

// -- the level-complete flourish (round 2) ---------------------------------------------------

/**
 * The flourish plays once, in the sunset (a big chrome moment), then settles into
 * the plain green card the game already shows. The card itself never turns pink:
 * the board is beside it.
 */
export function levelComplete(voice: Voice): { element: HTMLElement; replay: () => void } {
  const banner = h("div", { class: "complete-banner play" }, h("span", { class: "complete-text", "data-text": voice.complete }, voice.complete));
  const starRow = (label: string) => h("li", { class: "earned" }, icon("star"), label);
  const card = h(
    "div",
    { class: "outcome outcome-good" },
    h("div", { class: "outcome-head" }, h("strong", {}, "Solved!"), h("a", { class: "btn btn-primary btn-small", href: "#" }, "Next level →")),
    h("ul", { class: "stars" }, starRow("Solved"), starRow("Within par: 4 lines"), starRow("No hints")),
  );
  const replay = () => {
    banner.classList.remove("play");
    banner.getBoundingClientRect();
    banner.classList.add("play");
  };
  return { element: h("div", { class: "complete-mock" }, banner, card), replay };
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

function crownIcon(painter: Painter, mastered: boolean, px = 24): SVGElement {
  return svg("svg", { viewBox: "0 0 64 64", width: px, height: px, class: `crown-icon sprites-${painter.kind}`, "aria-hidden": "true" }, painter.draw(mastered ? "crownMaster" : "crown"));
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

function folder(options: { n: number; title: string; rows: Row[]; open: boolean; cleared?: boolean; mastered?: boolean; painter: Painter; voice: Voice; select: (r: HTMLElement) => void }): HTMLElement {
  const { n, title, rows, painter, voice } = options;
  const core = rows.filter((r) => !r.mastery);
  const done = core.filter((r) => (r.stars ?? 0) > 0).length;
  const segments = rows.map((r) => h("span", { class: `seg${(r.stars ?? 0) > 0 ? " on" : ""}${r.mastery ? " mastery" : ""}` }));
  const head = h(
    "button",
    { class: "folder-head", "aria-expanded": options.open ? "true" : "false" },
    h("span", { class: "folder-caret", "aria-hidden": "true" }, "▸"),
    h("span", { class: "folder-title" }, voice.chapter(n, title)),
    options.cleared
      ? h("span", { class: "victory", title: options.mastered ? "Chapter cleared, mastery done" : "Chapter cleared" }, crownIcon(painter, Boolean(options.mastered)), h("span", { class: "victory-label" }, options.mastered ? "mastered" : "cleared"))
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

export function lessonsSlice(painter: Painter, voice: Voice, hybrid = false): HTMLElement {
  const detail = h("aside", { class: "detail" });
  const showDetail = (rowElement?: HTMLElement) => {
    if (rowElement) {
      rowElement.closest(".lessons-mock")?.querySelectorAll(".lrow.selected").forEach((r) => r.classList.remove("selected"));
      rowElement.classList.add("selected");
    }
    if (!hybrid) return;
    const board = new BoardView(LEVEL, { mini: true });
    reskin(board.element, LEVEL, painter);
    detail.replaceChildren(
      h("p", { class: "detail-kicker" }, voice.detail),
      h("h4", {}, "Halt!"),
      h("p", { class: "muted" }, "f-strings: putting values into text"),
      h("div", { class: "detail-board" }, board.element as unknown as Node),
      h("div", { class: "detail-stars" }, "Best: ", ...starIcons(0)),
      h("div", { class: "detail-actions" }, h("button", { class: "btn btn-primary" }, icon("play"), "Run this level"), h("button", { class: "btn", disabled: true }, "Replay")),
    );
  };
  const blank = (rows: Row[]) => rows.map((r) => ({ title: r.title, trains: r.trains }));
  const explorer = h(
    "div",
    { class: "hud-frame" },
    h("p", { class: "tier-head" }, voice.tier),
    folder({ n: 1, title: "First Moves", rows: CHAPTER_1, open: false, cleared: true, painter, voice, select: showDetail }),
    folder({ n: 2, title: "Counting Steps", rows: CHAPTER_2, open: true, painter, voice, select: showDetail }),
    folder({ n: 3, title: "Marching Orders", rows: blank(CHAPTER_1), open: false, painter, voice, select: showDetail }),
    h("p", { class: "tier-head" }, voice.outside),
    folder({ n: 0, title: "Testing ground", rows: blank(CHAPTER_1.slice(0, 2)), open: false, painter, voice, select: showDetail }),
  );
  const crumbs = h("nav", { class: "lcrumbs", "aria-label": "Where you are" }, h("a", { href: "#" }, voice.crumbRoot), h("span", {}, "/"), h("span", {}, voice.chapter(2, "Counting Steps")));
  showDetail();
  return h(
    "section",
    { class: `lessons-mock${hybrid ? " hybrid" : ""}` },
    h("h3", { class: "lessons-title" }, voice.lessons),
    crumbs,
    hybrid ? h("div", { class: "hybrid-cols" }, explorer, detail) : explorer,
  );
}
