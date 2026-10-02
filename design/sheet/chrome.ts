// M3.7 step 0, round 6 (design prototype): the chrome in the approved style.
//   titleScreen()   the arcade title: chrome logo, sunset, the enemy rank before the sun, the hero under the menu
//   lessonsMenu()   the Lessons directory: tier headings, chapter folders, the victory crown, a detail pane
//   messages()      the cards a run ends in, in the engine's own words: a Python error with its traceback, a lost run, not there yet
import { BoardView } from "../../src/ui/board";
import { h } from "../../src/ui/dom";
import { icon } from "../../src/ui/icons";
import { el } from "../directions/looks";
import { LEVEL } from "../sample";
import type { Voice } from "../chrome";
import { dress } from "./dress";
import { crown, enemy, hero, type EnemyKind, type Skin } from "./sprites";

const svgNode = (node: SVGElement) => node as unknown as Node;

// -- the title screen ---------------------------------------------------------------------------------

const RANK: EnemyKind[] = ["rook", "bishop", "rook", "bishop", "bishop", "rook", "bishop", "rook"];

export function titleScreen(voice: Voice, skin: Skin): HTMLElement {
  const items = voice.menu.map((label, i) => ({ label, soon: i === 1 || i === 2 }));
  let selected = 0;
  const note = h("p", { class: "ts-note", "aria-live": "polite" }, "↑ ↓ to choose, Enter to open");
  const rows = items.map((item) =>
    h("li", { class: `ts-item${item.soon ? " soon" : ""}`, role: "menuitem", "aria-disabled": item.soon }, h("span", { class: "ts-cursor", "aria-hidden": "true" }, "▶"), h("span", {}, item.label), item.soon ? h("span", { class: "ts-tag" }, voice.comingSoon) : null),
  );
  const paint = () => rows.forEach((row, i) => row.classList.toggle("selected", i === selected));
  paint();
  const open = () => {
    const item = items[selected]!;
    note.textContent = item.soon ? `${item.label}: ${voice.comingSoon}` : `→ ${item.label}`;
  };
  // the enemy rank on the horizon, in front of the sun: broken wire, each glitching on its own beat
  const rank = el("svg", { viewBox: `0 0 ${RANK.length * 64} 64`, class: "ts-rank", "aria-hidden": "true" }, ...RANK.map((kind, i) => el("g", { transform: `translate(${i * 64 + 32} 32)` }, enemy(kind, "live", (i * 1.3) % 5, true))));
  const heroArt = el("svg", { viewBox: "-38 -38 76 76", class: "ts-hero", role: "img", "aria-label": `Your piece: the ${skin}` }, hero(skin, "south"));
  const root = h(
    "section",
    { class: "title-scene", tabindex: "0", "aria-label": "Start menu (use the arrow keys)" },
    h("div", { class: "ts-sky", "aria-hidden": "true" }, h("div", { class: "ts-sun" }), svgNode(rank), h("div", { class: "ts-floor" }), h("div", { class: "ts-vhs" })),
    h(
      "div",
      { class: "ts-body" },
      h("h2", { class: "ts-logo", "aria-label": "Rank and File" }, h("span", { class: "ts-logo-text", "data-text": "RANK & FILE" }, "RANK & FILE")),
      h("p", { class: "ts-sub" }, voice.subtitle),
      h("ul", { class: "ts-menu", role: "menu" }, ...rows),
      note,
      h("div", { class: "ts-hero-slot" }, svgNode(heroArt)),
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

// -- the Lessons menu -------------------------------------------------------------------------------------

interface Row {
  title: string;
  trains: string;
  stars?: number;
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

function crownIcon(mastered: boolean): SVGElement {
  return el("svg", { viewBox: "-32 -26 64 44", width: 26, height: 18, class: "crown-icon", "aria-hidden": "true" }, crown(mastered));
}

function levelRow(row: Row, index: number, select: (r: HTMLElement) => void): HTMLElement {
  const solved = (row.stars ?? 0) > 0;
  const element = h(
    "li",
    { class: `lrow${solved ? " solved" : ""}${row.next ? " selected" : ""}`, tabindex: "0" },
    h("span", { class: "lrow-num" }, solved ? "✓" : String(index + 1)),
    h("span", { class: "lrow-text" }, h("strong", {}, row.title, row.mastery ? h("span", { class: "mastery-tag" }, "Mastery · optional") : null), h("span", { class: "muted small" }, row.trains)),
    solved ? h("span", { class: "card-stars", title: `${row.stars} of 3 stars` }, ...starIcons(row.stars ?? 0)) : null,
    row.seen ? h("span", { class: "card-tag muted small" }, "Solution seen") : null,
  );
  element.addEventListener("click", () => select(element));
  return element;
}

function folder(voice: Voice, n: number, title: string, rows: Row[], open: boolean, select: (r: HTMLElement) => void, cleared?: "cleared" | "mastered"): HTMLElement {
  const core = rows.filter((r) => !r.mastery);
  const done = core.filter((r) => (r.stars ?? 0) > 0).length;
  const head = h(
    "button",
    { class: "folder-head", "aria-expanded": String(open) },
    h("span", { class: "folder-caret", "aria-hidden": "true" }, "▸"),
    h("span", { class: "folder-title" }, voice.chapter(n, title)),
    cleared ? h("span", { class: "victory", title: cleared === "mastered" ? "Chapter cleared, mastery done" : "Chapter cleared" }, svgNode(crownIcon(cleared === "mastered")), h("span", {}, cleared)) : null,
    h("span", { class: "segments", role: "img", "aria-label": `${done} of ${core.length} levels solved` }, ...rows.map((r) => h("span", { class: `seg${(r.stars ?? 0) > 0 ? " on" : ""}${r.mastery ? " mastery" : ""}` }))),
  );
  const element = h("div", { class: `folder${open ? " open" : ""}` }, head, h("div", { class: "folder-slide" }, h("ol", { class: "lrows" }, ...rows.map((r, i) => levelRow(r, i, select)))));
  head.addEventListener("click", () => head.setAttribute("aria-expanded", String(element.classList.toggle("open"))));
  return element;
}

export function lessonsMenu(voice: Voice): HTMLElement {
  const board = new BoardView({ ...LEVEL, start: { ...LEVEL.start, facing: "east" } }, { mini: true });
  dress(board.element, LEVEL, { facing: "east" });
  const detail = h(
    "aside",
    { class: "detail" },
    h("p", { class: "detail-kicker" }, voice.detail),
    h("h4", {}, "Halt!"),
    h("p", { class: "muted" }, "f-strings: putting values into text"),
    h("div", { class: "detail-board" }, svgNode(board.element)),
    h("div", { class: "detail-stars" }, "Best: ", ...starIcons(0)),
    h("div", { class: "detail-actions" }, h("button", { class: "btn btn-primary" }, icon("play"), "Run this level"), h("button", { class: "btn", disabled: true }, "Replay")),
  );
  const select = (row: HTMLElement) => {
    row.closest(".lessons")?.querySelectorAll(".lrow.selected").forEach((r) => r.classList.remove("selected"));
    row.classList.add("selected");
  };
  const blank = (rows: Row[]) => rows.map((r) => ({ title: r.title, trains: r.trains }));
  return h(
    "section",
    { class: "lessons" },
    h("h3", { class: "lessons-title" }, voice.lessons),
    h("nav", { class: "lcrumbs", "aria-label": "Where you are" }, h("a", { href: "#" }, voice.crumbRoot), h("span", {}, "/"), h("span", {}, voice.chapter(2, "Counting Steps"))),
    h(
      "div",
      { class: "lessons-cols" },
      h(
        "div",
        { class: "hud-frame" },
        h("p", { class: "tier-head" }, voice.tier),
        folder(voice, 1, "First Moves", CHAPTER_1, false, select, "cleared"),
        folder(voice, 2, "Counting Steps", CHAPTER_2, true, select),
        folder(voice, 3, "Marching Orders", blank(CHAPTER_1), false, select),
        h("p", { class: "tier-head" }, voice.outside),
        folder(voice, 0, "Testing ground", blank(CHAPTER_1.slice(0, 2)), false, select),
      ),
      detail,
    ),
  );
}

// -- the messages a run ends in ---------------------------------------------------------------------------

const TRACEBACK = ["Traceback (most recent call last):", '  File "<player>", line 2, in <module>', "    pwan.move()", "NameError: name 'pwan' is not defined. Did you mean: 'pawn'?"].join("\n");

export function messages(voice: Voice): HTMLElement {
  const card = (tone: string, head: string, ...body: Array<Node | string>) => h("div", { class: `outcome outcome-${tone}` }, h("div", { class: "outcome-head" }, h("strong", {}, head)), ...body);
  return h(
    "div",
    { class: "messages" },
    card(
      "bad",
      "Python stopped",
      h("div", { class: "error-detail" }, h("p", {}, h("span", { class: "line-tag" }, "line 2"), "Python doesn't know the name `pwan`. Did you mean `pawn`?"), h("details", { open: true }, h("summary", {}, "Show the real traceback"), h("pre", { class: "traceback" }, TRACEBACK))),
    ),
    card("bad", voice.lost, h("p", {}, "The rook on c3 took your pawn on c2.")),
    card("warn", "Not there yet", h("p", {}, "Your program finished, but your pawn stopped on b1, and the goal is on j8.")),
  );
}
