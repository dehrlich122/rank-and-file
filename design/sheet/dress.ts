// M3.7 step 0, round 6 (design prototype): dresses a real BoardView in the approved style.
//
// BoardView decides nothing visual that matters here, so this swaps the insides of
// its art groups for the new sprites. Each group keeps its class, its <title> and
// its badges, so every state class (open, crossed, collected, bridged, gone, lost,
// celebrate, bumping, reading, refusing) still applies. Step 1 moves this into board.ts.
import type { Facing, LevelInfo } from "../../src/py/protocol";
import { el } from "../directions/looks";
import { enemy, goal, hero, tile, type EnemyKind, type Skin, type TileName } from "./sprites";

const S = 64;
const M = 22; // BoardView's margin for the coordinates

let boards = 0;

/** The lit grid: thin lines between squares, a tick where they cross, a faint glow on the outer edge only. */
function litGrid(width: number, height: number): SVGElement {
  let lines = "";
  let ticks = "";
  for (let x = 1; x < width; x++) lines += `M ${M + x * S} 0 V ${height * S} `;
  for (let y = 1; y < height; y++) lines += `M ${M} ${y * S} H ${M + width * S} `;
  for (let x = 0; x <= width; x++) for (let y = 0; y <= height; y++) ticks += `M ${M + x * S - 4} ${y * S} h 8 M ${M + x * S} ${y * S - 4} v 8 `;
  return el("g", { class: "litgrid", "aria-hidden": "true" }, el("path", { d: lines, class: "grid-lines" }), el("path", { d: ticks, class: "grid-ticks" }), el("rect", { x: M, y: 0, width: width * S, height: height * S, class: "grid-edge" }));
}

/**
 * The halftone for threatened squares, sized in squares so it scales with the board:
 * about six dots across a square, or four bigger ones when the board is drawn small.
 */
function halftones(id: number): { defs: SVGElement; fine: string; coarse: string } {
  const [fine, coarse] = [`ht-fine-${id}`, `ht-coarse-${id}`];
  const pattern = (pid: string, step: number, r: number) =>
    el("pattern", { id: pid, patternUnits: "userSpaceOnUse", width: step, height: step, patternTransform: "rotate(45)" }, el("circle", { cx: step / 2, cy: step / 2, r, class: "ht-dot" }));
  return { defs: el("defs", {}, pattern(fine, S / 6, 1.7), pattern(coarse, S / 4, 3)), fine, coarse };
}

/** Below this many pixels a square, the coarser halftone takes over, so a dot stays about 1.5px or more. */
const COARSE_BELOW = 32;

/** Empty an art group but keep its tooltip and badges (and anything `keep` matches). */
function clear(group: Element, keep = ""): void {
  for (const child of [...group.children]) {
    if (child.tagName === "title" || child.classList.contains("badge-group") || (keep && child.matches(keep))) continue;
    child.remove();
  }
}

const centredOn = (left: number, top: number, art: SVGElement) => el("g", { class: "spr", transform: `translate(${left + S / 2} ${top + S / 2})` }, art);

export function dress(board: SVGSVGElement, level: LevelInfo, options: { skin?: Skin; facing?: Facing } = {}): void {
  const id = ++boards;
  board.classList.add("dressed");
  const ht = halftones(id);
  board.prepend(ht.defs);
  board.style.setProperty("--halftone", `url(#${ht.fine})`);
  // pick the halftone by the size the board is actually drawn at, and again whenever that changes
  new ResizeObserver(() => {
    const width = board.getBoundingClientRect().width;
    const perSquare = (width / Number(board.viewBox.baseVal.width)) * S;
    board.style.setProperty("--halftone", `url(#${perSquare < COARSE_BELOW ? ht.coarse : ht.fine})`);
  }).observe(board);

  const squares = board.querySelector(".squares")!;
  squares.after(litGrid(level.width, level.height));

  // tiles: each art group follows its square, which gives its corner
  let corner: [number, number] = [0, 0];
  for (const child of [...squares.children]) {
    if (child.tagName === "rect") {
      corner = [Number(child.getAttribute("x")), Number(child.getAttribute("y"))];
      continue;
    }
    const [left, top] = corner;
    const cls = child.classList;
    const swap = (name: TileName) => {
      clear(child);
      child.append(centredOn(left, top, tile(name)));
    };
    if (cls.contains("wall")) swap("wall");
    else if (cls.contains("signpost")) swap("sign");
    else if (cls.contains("rune")) {
      swap("rune");
      child.append(el("rect", { x: left + 8, y: top + 18, width: S - 16, height: S - 30, class: "rune-flash" }));
    } else if (cls.contains("gate")) {
      clear(child);
      const closed = el("g", { class: "spr-closed" }, tile(cls.contains("timed-gate") ? "gateTimed" : "gate"));
      const open = el("g", { class: "spr-open" }, tile("gateOpen"));
      child.prepend(centredOn(left, top, el("g", {}, closed, open)), el("rect", { x: left + 4, y: top + 4, width: S - 8, height: S - 8, class: "gate-flash" }));
    } else if (cls.contains("pit")) {
      const plank = child.querySelector(".pit-plank")!;
      clear(child, ".pit-plank");
      clear(plank);
      plank.append(centredOn(left, top, tile("plank")));
      plank.before(centredOn(left, top, tile("pit")));
    } else if (cls.contains("plank")) swap("plank");
    else if (cls.contains("waypoint")) {
      clear(child);
      child.append(centredOn(left, top, el("g", {}, el("g", { class: "spr-todo" }, tile("waypoint")), el("g", { class: "spr-done" }, tile("waypointDone")))));
    } else if (cls.contains("gem")) swap("gem");
  }

  // the goal: the board's one beacon (its ring is replaced, the hidden-goal spots stay rings)
  for (const target of board.querySelectorAll(".goal")) {
    const ring = target.querySelector("circle")!;
    const [left, top] = [Number(ring.getAttribute("cx")) - S / 2, Number(ring.getAttribute("cy")) - S / 2];
    target.replaceChildren(centredOn(left, top, goal()));
  }

  // enemies: broken wire, each glitching on its own beat
  level.enemies.forEach((foe, i) => {
    const group = board.querySelectorAll(":scope > .enemy")[i];
    if (!group) return;
    const badges = [...group.querySelectorAll(":scope > .badge-group")];
    clear(group);
    const kind: EnemyKind = foe.kind === "rook" ? "rook" : foe.kind === "bishop" ? "bishop" : "chaser";
    group.prepend(enemy(kind, "live", i * 1.9));
    group.append(...badges);
  });

  // the hero
  board.querySelector(".pawn")?.replaceChildren(hero(options.skin ?? "pawn", options.facing ?? level.start.facing));
}

/** Swap the hero (a skin or a facing) on a dressed board. */
export function setHero(board: SVGSVGElement, skin: Skin, face: Facing): void {
  board.querySelector(".pawn")?.replaceChildren(hero(skin, face));
}
