// M3.7 step 0, round 3 (design prototype): four directions side by side.
//   /design/directions.html
// Each is a 3x3 crop of the real lit-grid board (BoardView), dark theme only: the
// hero pawn, an enemy rook, a wall and one threatened square, plus the pawn alone
// at a large size. No animation this round. Dev-only, like the rest of design/.
import "@fontsource/orbitron/700.css";
import "../src/styles.css";
import "./directions.css";
import { BoardView } from "../src/ui/board";
import { h } from "../src/ui/dom";
import type { LevelInfo, Pos, WorldState } from "../src/py/protocol";
import { el, LOOKS, type Look } from "./directions/looks";

const S = 64;
const M = 22; // BoardView's margin for the coordinates
const N = 3;

const PAWN: Pos = [0, 0]; // a1
const ROOK: Pos = [2, 2]; // c3
const WALL: Pos = [1, 2]; // b3
const THREAT: Pos = [2, 1]; // c2

const start: WorldState = {
  pos: PAWN,
  facing: "north",
  opened: [],
  crossed: [],
  collected: [],
  planks: 0,
  bridged: [],
  enemies: [ROOK],
  tick: 0,
  lost: null,
  attacked: [THREAT],
};

const tiles = Array.from({ length: N }, (_, y) => Array.from({ length: N }, (_, x) => (x === WALL[0] && y === WALL[1] ? "wall" : "floor")));

const LEVEL = {
  id: "directions",
  chapter: 0,
  title: "Directions",
  trains: "",
  brief: "",
  piece: "pawn",
  width: N,
  height: N,
  tiles,
  signs: [],
  runes: [],
  questions: [],
  timed_gates: [],
  enemies: [{ kind: "rook", route: [ROOK], loop: false, clock: "action", armoured: false }],
  goal: null,
  goal_spots: [],
  case_title: "",
  start,
  objectives: { reach_goal: false, say: [], waypoints: false, collect: null, capture: null },
  api: [],
  constraints: { max_lines: null, min_comments: 0, require_nodes: [], ban_nodes: [], max_numbers: null },
  par: { lines: null },
  starter: "",
  goals: [],
  rules: [],
  obstacles: [],
  stars: [],
  hints: [],
  mastery: false,
  boards: [],
} satisfies LevelInfo;

/** The lit grid: thin lines between squares, a tick where they cross, a faint glow on the outer edge. */
function litGrid(): SVGElement {
  let lines = "";
  let ticks = "";
  for (let i = 1; i < N; i++) lines += `M ${M + i * S} 0 V ${N * S} M ${M} ${i * S} H ${M + N * S} `;
  for (let x = 0; x <= N; x++) for (let y = 0; y <= N; y++) ticks += `M ${M + x * S - 4} ${y * S} h 8 M ${M + x * S} ${y * S - 4} v 8 `;
  return el("g", { class: "litgrid", "aria-hidden": "true" }, el("path", { d: lines, class: "grid-lines" }), el("path", { d: ticks, class: "grid-ticks" }), el("rect", { x: M, y: 0, width: N * S, height: N * S, class: "grid-edge" }));
}

/** Empty an art group but keep its tooltip. */
function clear(group: Element): void {
  for (const child of [...group.children]) if (child.tagName !== "title") child.remove();
}

function board(look: Look): HTMLElement {
  const view = new BoardView(LEVEL);
  const svg = view.element;
  const hatch = `hatch-${look.id}`;
  svg.prepend(el("defs", {}, look.hatch(hatch)));
  svg.querySelector(".squares")!.after(litGrid());
  // inline, because the game's own stylesheet sets the hatch's fill and would win over an attribute
  const threat = svg.querySelector<SVGRectElement>(".attacked");
  if (threat) threat.style.fill = `url(#${hatch})`;
  const wall = svg.querySelector(".wall")!;
  clear(wall);
  wall.append(el("g", { transform: `translate(${M + WALL[0] * S + S / 2} ${(N - 1 - WALL[1]) * S + S / 2})` }, look.wall()));
  const rook = svg.querySelector(".enemy")!;
  clear(rook);
  rook.append(look.rook());
  svg.querySelector(".pawn")!.replaceChildren(look.pawn());
  return h("div", { class: "dir-board" }, svg as unknown as Node);
}

/** The pawn alone, large, on one dark square of the lit grid. */
function large(look: Look): HTMLElement {
  const svg = el(
    "svg",
    { viewBox: "-36 -36 72 72", class: "dir-large", role: "img", "aria-label": `${look.name}: the hero pawn, large` },
    el("rect", { x: -32, y: -32, width: 64, height: 64, class: "sq-dark" }),
    el("rect", { x: -32, y: -32, width: 64, height: 64, class: "grid-edge" }),
    look.pawn(),
  );
  return h("div", { class: "dir-large-wrap" }, svg as unknown as Node);
}

const page = document.getElementById("directions")!;
page.append(
  h(
    "header",
    { class: "dir-head" },
    h("h1", {}, "Round 3 · four directions"),
    h("p", {}, "Each is built differently. A 3×3 crop of the lit-grid board (hero pawn, enemy rook, wall, one threatened square), then the hero pawn alone, large. Dark theme, no animation."),
  ),
  h(
    "div",
    { class: "dir-grid" },
    ...LOOKS.map((look) =>
      h("section", { class: "dir", "data-dir": look.id }, h("h2", {}, h("span", { class: "dir-letter" }, look.id), look.name), h("p", { class: "dir-blurb" }, look.blurb), board(look), large(look)),
    ),
  ),
);
