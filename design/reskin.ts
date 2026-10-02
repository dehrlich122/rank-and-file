// M3.7 step 0 (design prototype): dresses a real BoardView in a style tile.
//
// BoardView draws the board and decides nothing visual that matters here, so
// this swaps the *insides* of its art groups for pixel sprites. Each group keeps
// its class, its <title> and its badges, so every state class (open, crossed,
// collected, bridged, gone, lost, celebrate, bumping, reading, refusing) still
// applies. Step 1 moves all of this into TILE_ART and a sprite and skin registry.
import {
  BISHOP,
  BLOB,
  FLAG,
  GATE,
  GATE_OPEN,
  GATE_TIMED,
  GEM,
  KNIGHT,
  PAWN,
  PIT,
  PLANK,
  RUNE,
  RUNE_PROMPT,
  ROOK,
  SIZE,
  WALL,
  WALL_CIRCUIT,
  WAYPOINT,
  WAYPOINT_DONE,
  SIGN,
  centred,
  corruption,
  draw,
  type Mode,
  type Sprite,
} from "./sprites";
import type { LevelInfo } from "../src/py/protocol";

const SVG = "http://www.w3.org/2000/svg";
const S = 64;
const M = 22; // BoardView's margin for the coordinates

export type TileName = "snes" | "neon" | "terminal";
export type Skin = "pawn" | "knight";

interface Kit {
  mode: Mode;
  wall: Sprite;
  rune: Sprite;
}

export const KITS: Record<TileName, Kit> = {
  snes: { mode: "full", wall: WALL, rune: RUNE },
  neon: { mode: "neon", wall: WALL, rune: RUNE },
  terminal: { mode: "mono", wall: WALL_CIRCUIT, rune: RUNE_PROMPT },
};

const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] => {
  const node = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  return node;
};

/** Children placed on a square whose top-left corner is (left, top). */
const at = (left: number, top: number, className: string, ...children: SVGElement[]): SVGGElement => {
  const group = el("g", { class: className, transform: `translate(${left} ${top})` });
  group.append(...children);
  return group;
};

/** Remove everything from an art group except its tooltip and badges (and anything `keep` matches). */
function clear(group: Element, keep = ""): void {
  for (const child of [...group.children]) {
    if (child.tagName === "title" || child.classList.contains("badge-group") || (keep && child.matches(keep))) continue;
    child.remove();
  }
}

/** The lit grid: thin lines between squares, a tick where they cross, and a faint glow on the outer edge only. */
function litGrid(width: number, height: number): SVGGElement {
  const group = el("g", { class: "litgrid", "aria-hidden": "true" });
  let lines = "";
  let ticks = "";
  for (let x = 1; x < width; x++) lines += `M ${M + x * S} 0 V ${height * S} `;
  for (let y = 1; y < height; y++) lines += `M ${M} ${y * S} H ${M + width * S} `;
  for (let x = 0; x <= width; x++) {
    for (let y = 0; y <= height; y++) ticks += `M ${M + x * S - 4} ${y * S} h 8 M ${M + x * S} ${y * S - 4} v 8 `;
  }
  group.append(
    el("path", { d: lines, class: "grid-lines" }),
    el("path", { d: ticks, class: "grid-ticks" }),
    el("rect", { x: M, y: 0, width: width * S, height: height * S, class: "grid-edge" }),
  );
  return group;
}

/** The pixel sprite for one hero skin: two idle frames (the head sinks one pixel on the second). */
function hero(skin: Skin, mode: Mode): SVGGElement {
  const sprite = skin === "pawn" ? PAWN : KNIGHT;
  const split = skin === "pawn" ? 8 : 6;
  const group = el("g", { class: "hero" });
  const a = el("g", { class: "idle-a" });
  a.append(centred(draw(sprite, mode)));
  const b = el("g", { class: "idle-b" });
  const frame = el("g");
  frame.append(draw(sprite, mode, { rows: [split + 1, SIZE - 1] }), draw(sprite, mode, { rows: [0, split], dy: 1 }));
  b.append(centred(frame));
  group.append(a, b);
  return group;
}

/** Swap the player's piece between skins. */
export function setHero(board: SVGSVGElement, skin: Skin, style: TileName): void {
  const pawn = board.querySelector(".pawn");
  if (!pawn) return;
  pawn.replaceChildren(hero(skin, KITS[style].mode));
}

/** Dress a freshly built board. `level` is what the BoardView was built from. */
export function reskin(board: SVGSVGElement, level: LevelInfo, style: TileName, skin: Skin = "pawn"): void {
  const { mode, wall, rune } = KITS[style];
  const squares = board.querySelector<SVGGElement>(".squares")!;

  // 1. The checker goes to the bottom, then the lit grid, so lines never cross a sprite.
  const checker = el("g", { class: "checker" });
  const pairs: Array<[SVGRectElement, SVGGElement]> = [];
  for (const child of [...squares.children]) {
    if (child.tagName === "rect" && child.classList.contains("sq-light") || child.classList.contains("sq-dark")) {
      checker.append(child);
    } else if (child.tagName === "g" && checker.lastElementChild) {
      pairs.push([checker.lastElementChild as SVGRectElement, child as SVGGElement]);
    }
  }
  squares.before(checker, litGrid(level.width, level.height));

  // 2. Tiles: each art group sits right after its square, which gives its corner.
  const spr = (sprite: Sprite, className = "") => {
    const group = el("g", { class: className });
    group.append(draw(sprite, mode));
    return group;
  };
  for (const [rect, art] of pairs) {
    const left = Number(rect.getAttribute("x"));
    const top = Number(rect.getAttribute("y"));
    const cls = art.classList;
    if (cls.contains("wall")) {
      clear(art);
      art.append(at(left, top, "spr", spr(wall)));
    } else if (cls.contains("signpost")) {
      clear(art);
      art.append(at(left, top, "spr", spr(SIGN)));
    } else if (cls.contains("rune")) {
      clear(art);
      art.append(at(left, top, "spr", spr(rune)), el("rect", { x: left + 8, y: top + 12, width: S - 16, height: S - 24, class: "rune-flash" }));
    } else if (cls.contains("gate")) {
      clear(art);
      art.append(
        at(left, top, "spr", spr(cls.contains("timed-gate") ? GATE_TIMED : GATE, "spr-closed"), spr(GATE_OPEN, "spr-open")),
        el("rect", { x: left + 4, y: top + 4, width: S - 8, height: S - 8, class: "gate-flash" }),
      );
    } else if (cls.contains("pit")) {
      const plank = art.querySelector(".pit-plank")!;
      clear(art, ".pit-plank");
      clear(plank);
      plank.append(at(left, top, "spr", spr(PLANK)));
      plank.before(at(left, top, "spr", spr(PIT)));
    } else if (cls.contains("plank")) {
      clear(art);
      art.append(at(left, top, "spr", spr(PLANK)));
    } else if (cls.contains("waypoint")) {
      clear(art);
      art.append(at(left, top, "spr", spr(WAYPOINT, "spr-todo"), spr(WAYPOINT_DONE, "spr-done")));
    } else if (cls.contains("gem")) {
      clear(art);
      art.append(at(left, top, "spr", spr(GEM)));
    }
  }

  // 3. The goal: keep its dashed ring, swap the flag for the sprite.
  for (const goal of board.querySelectorAll(".goal")) {
    const ring = goal.querySelector("circle")!;
    const left = Number(ring.getAttribute("cx")) - S / 2;
    const top = Number(ring.getAttribute("cy")) - S / 2;
    goal.querySelector(".goal-pole")?.remove();
    goal.querySelector(".goal-flag")?.remove();
    goal.append(at(left, top, "spr", spr(FLAG)));
  }

  // 4. Enemies: a sprite under its corruption layers.
  level.enemies.forEach((enemy, i) => {
    const group = board.querySelectorAll(":scope > .enemy")[i];
    if (!group) return;
    const sprite = enemy.kind === "rook" ? ROOK : enemy.kind === "bishop" ? BISHOP : BLOB;
    const layers = corruption(sprite, 11 + i * 7);
    clear(group);
    group.append(layers.fringe, layers.under, el("g", { class: "spr" }), layers.over);
    group.querySelector(".spr")!.append(centred(draw(sprite, mode)));
    (group as SVGGElement).style.setProperty("--glitch-delay", `${i * 1.7}s`);
  });

  // 5. The piece.
  setHero(board, skin, style);
}
