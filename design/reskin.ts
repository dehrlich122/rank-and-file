// M3.7 step 0 (design prototype): dresses a real BoardView in a style tile.
//
// BoardView draws the board and decides nothing visual that matters here, so
// this swaps the *insides* of its art groups for sprites. Each group keeps its
// class, its <title> and its badges, so every state class (open, crossed,
// collected, bridged, gone, lost, celebrate, bumping, reading, refusing) still
// applies. Step 1 moves all of this into TILE_ART and a sprite and skin registry.
import { corruption, hero, pixelPainter, vectorPainter, type Painter, type SpriteName } from "./paint";
import { RUNE_PROMPT, WALL_CIRCUIT, WAYPOINT_DIAMOND, WAYPOINT_DIAMOND_DONE } from "./sprites";
import type { LevelInfo } from "../src/py/protocol";

const SVG = "http://www.w3.org/2000/svg";
const S = 64;
const M = 22; // BoardView's margin for the coordinates

export type TileName = "snes" | "neon" | "terminal" | "noir";
export type Skin = "pawn" | "knight";
export type SpriteStyle = "pixel" | "vector";

/** The painter a tile draws with. Only the noir tile (round 2) offers both styles. */
export function painterFor(style: TileName, sprites: SpriteStyle = "pixel"): Painter {
  if (style === "snes") return pixelPainter("full");
  if (style === "neon") return pixelPainter("neon");
  if (style === "terminal") return pixelPainter("mono", { wall: WALL_CIRCUIT, rune: RUNE_PROMPT });
  return sprites === "vector" ? vectorPainter() : pixelPainter("neon", { waypoint: WAYPOINT_DIAMOND, waypointDone: WAYPOINT_DIAMOND_DONE });
}

const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] => {
  const node = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  return node;
};

/** Children placed on a square whose top-left corner is (left, top). */
const at = (left: number, top: number, ...children: SVGElement[]): SVGGElement => {
  const group = el("g", { class: "spr", transform: `translate(${left} ${top})` });
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

/** Swap the player's piece between skins. */
export function setHero(board: SVGSVGElement, skin: Skin, painter: Painter): void {
  board.querySelector(".pawn")?.replaceChildren(hero(painter, skin));
}

/** An enemy sprite between its corruption layers, centred on (0, 0). */
export function corrupted(painter: Painter, name: SpriteName, seed: number, group: SVGGElement = el("g")): SVGGElement {
  const layers = corruption(painter, name, seed);
  const body = el("g", { class: "spr" });
  body.append(centredSprite(painter, name));
  group.append(layers.fringe, layers.under, body, layers.over);
  return group;
}

const centredSprite = (painter: Painter, name: SpriteName) => {
  const wrap = el("g", { transform: "translate(-32 -32)" });
  wrap.append(painter.draw(name));
  return wrap;
};

/** Dress a freshly built board. `level` is what the BoardView was built from. */
export function reskin(board: SVGSVGElement, level: LevelInfo, painter: Painter, skin: Skin = "pawn"): void {
  board.classList.add(`sprites-${painter.kind}`);
  const squares = board.querySelector<SVGGElement>(".squares")!;

  // 1. The checker goes to the bottom, then the lit grid, so lines never cross a sprite.
  const checker = el("g", { class: "checker" });
  const pairs: Array<[SVGRectElement, SVGGElement]> = [];
  for (const child of [...squares.children]) {
    if (child.tagName === "rect" && (child.classList.contains("sq-light") || child.classList.contains("sq-dark"))) {
      checker.append(child);
    } else if (child.tagName === "g" && checker.lastElementChild) {
      pairs.push([checker.lastElementChild as SVGRectElement, child as SVGGElement]);
    }
  }
  squares.before(checker, litGrid(level.width, level.height));

  // 2. Tiles: each art group sits right after its square, which gives its corner.
  const spr = (name: SpriteName, className = "") => {
    const group = el("g", className ? { class: className } : {});
    group.append(painter.draw(name));
    return group;
  };
  for (const [rect, art] of pairs) {
    const left = Number(rect.getAttribute("x"));
    const top = Number(rect.getAttribute("y"));
    const cls = art.classList;
    if (cls.contains("wall")) {
      clear(art);
      art.append(at(left, top, spr("wall")));
    } else if (cls.contains("signpost")) {
      clear(art);
      art.append(at(left, top, spr("sign")));
    } else if (cls.contains("rune")) {
      clear(art);
      art.append(at(left, top, spr("rune")), el("rect", { x: left + 8, y: top + 12, width: S - 16, height: S - 24, class: "rune-flash" }));
    } else if (cls.contains("gate")) {
      clear(art);
      art.append(
        at(left, top, spr(cls.contains("timed-gate") ? "gateTimed" : "gate", "spr-closed"), spr("gateOpen", "spr-open")),
        el("rect", { x: left + 4, y: top + 4, width: S - 8, height: S - 8, class: "gate-flash" }),
      );
    } else if (cls.contains("pit")) {
      const plank = art.querySelector(".pit-plank")!;
      clear(art, ".pit-plank");
      clear(plank);
      plank.append(at(left, top, spr("plank")));
      plank.before(at(left, top, spr("pit")));
    } else if (cls.contains("plank")) {
      clear(art);
      art.append(at(left, top, spr("plank")));
    } else if (cls.contains("waypoint")) {
      clear(art);
      art.append(at(left, top, spr("waypoint", "spr-todo"), spr("waypointDone", "spr-done")));
    } else if (cls.contains("gem")) {
      clear(art);
      art.append(at(left, top, spr("gem")));
    }
  }

  // 3. The goal: keep its dashed ring, swap the flag for the sprite.
  for (const goal of board.querySelectorAll(".goal")) {
    const ring = goal.querySelector("circle")!;
    const left = Number(ring.getAttribute("cx")) - S / 2;
    const top = Number(ring.getAttribute("cy")) - S / 2;
    goal.querySelector(".goal-pole")?.remove();
    goal.querySelector(".goal-flag")?.remove();
    goal.append(at(left, top, spr("flag")));
  }

  // 4. Enemies: a sprite between its corruption layers.
  level.enemies.forEach((enemy, i) => {
    const group = board.querySelectorAll<SVGGElement>(":scope > .enemy")[i];
    if (!group) return;
    clear(group);
    const name: SpriteName = enemy.kind === "rook" ? "rook" : enemy.kind === "bishop" ? "bishop" : "blob";
    // badges stay last, so they draw over the glitch
    const badges = [...group.querySelectorAll(":scope > .badge-group")];
    group.prepend(...corrupted(painter, name, 11 + i * 7).childNodes);
    group.append(...badges);
    group.style.setProperty("--glitch-delay", `${i * 1.7}s`);
  });

  // 5. The piece.
  setHero(board, skin, painter);
}
