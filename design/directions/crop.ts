// M3.7 step 0, rounds 3 and 4 (design prototype): the tiny board sample.
// A 3x3 crop of the real lit-grid board (BoardView): the hero pawn on a1, an enemy
// rook on c3, a wall on b3 and one threatened square on c2, each drawn by the caller.
import { BoardView } from "../../src/ui/board";
import { h } from "../../src/ui/dom";
import type { Facing, LevelInfo, Pos, WorldState } from "../../src/py/protocol";
import { el } from "./looks";

const S = 64;
const M = 22; // BoardView's margin for the coordinates
const N = 3;

const PAWN: Pos = [0, 0]; // a1
const ROOK: Pos = [2, 2]; // c3
const WALL: Pos = [1, 2]; // b3
const THREAT: Pos = [2, 1]; // c2

function level(facing: Facing): LevelInfo {
  const start: WorldState = { pos: PAWN, facing, opened: [], crossed: [], collected: [], planks: 0, bridged: [], enemies: [ROOK], tick: 0, lost: null, attacked: [THREAT] };
  return {
    id: "directions",
    chapter: 0,
    title: "Directions",
    trains: "",
    brief: "",
    piece: "pawn",
    width: N,
    height: N,
    tiles: Array.from({ length: N }, (_, y) => Array.from({ length: N }, (_, x) => (x === WALL[0] && y === WALL[1] ? "wall" : "floor"))),
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
  };
}

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

export interface CropParts {
  pawn: SVGElement;
  rook: SVGElement;
  wall: SVGElement;
  hatch: SVGElement; // a <pattern> for the threatened square
  hatchId: string; // its id
  facing?: Facing;
}

/** The 3x3 crop, dressed with the caller's art. */
export function cropBoard(parts: CropParts): HTMLElement {
  const view = new BoardView(level(parts.facing ?? "north"));
  const svg = view.element;
  svg.prepend(el("defs", {}, parts.hatch));
  svg.querySelector(".squares")!.after(litGrid());
  // inline, because the game's own stylesheet sets the hatch's fill and would win over an attribute
  const threat = svg.querySelector<SVGRectElement>(".attacked");
  if (threat) threat.style.fill = `url(#${parts.hatchId})`;
  const wall = svg.querySelector(".wall")!;
  clear(wall);
  wall.append(el("g", { transform: `translate(${M + WALL[0] * S + S / 2} ${(N - 1 - WALL[1]) * S + S / 2})` }, parts.wall));
  const rook = svg.querySelector(".enemy")!;
  clear(rook);
  rook.append(parts.rook);
  svg.querySelector(".pawn")!.replaceChildren(parts.pawn);
  return h("div", { class: "dir-board" }, svg as unknown as Node);
}

/** One piece alone, large, on one dark square of the lit grid. */
export function largeSquare(piece: SVGElement, label: string, className = "dir-large"): HTMLElement {
  const svg = el(
    "svg",
    { viewBox: "-36 -36 72 72", class: className, role: "img", "aria-label": label },
    el("rect", { x: -32, y: -32, width: 64, height: 64, class: "sq-dark" }),
    el("rect", { x: -32, y: -32, width: 64, height: 64, class: "grid-edge" }),
    piece,
  );
  return h("div", { class: "dir-large-wrap" }, svg as unknown as Node);
}
