// Every sprite of the look, each centred on (0, 0) in its 64-unit square and staying inside it.
//   the hero (pawn or knight skin): solid, the only floor shadow, HUD brackets that show its facing
//   enemies (rook, bishop, chaser): broken magenta wire, glitching now and then
//   tiles: clean wire. Violet for structure, amber for things to act on, green for text the world holds
// The registry at the bottom says which sprite each tile kind and enemy kind uses (board.ts).
import type { Enemy, Facing, TileKind } from "../../py/protocol";
import { svg as el } from "../svg";
import { fit, floor, pawnModel, project, pts, rookModel, rookSlit, wallModel, yaw, type Model, type V3 } from "./mesh";
import { broken, fitShape, live, solid, wire, type Decal, type Frame } from "./draw";
import { beaconShape, bishopCut, bishopModel, brickLines, gateShape, gemShape, knightEyes, knightModel, pitShape, plankShape, runeShape, signShape, virusEyes, virusModel, waypointShape, type Shape } from "./models";

let ids = 0;
const uid = (prefix: string) => `sprite-${prefix}-${++ids}`;

// -- the hero ---------------------------------------------------------------------------------------

export type Skin = "pawn" | "knight";

// The low-poly pawn's visor points here after pawnModel's own turn; each facing turns it there.
const VISOR = Math.PI / 2 + Math.PI / 8 + 0.25;
const PAWN_FACING: Record<Facing, number> = { east: 0.35, west: Math.PI - 0.35, south: Math.PI / 2, north: -Math.PI / 2 };
// The knight's head points along -x; a facing turns it, a little toward us for east and west.
const KNIGHT_TURN: Record<Facing, number> = { west: -0.3, east: 0.3 - Math.PI, south: -Math.PI / 2, north: Math.PI / 2 };

const turn = (angle: number) => {
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  return ([x, y, z]: V3): V3 => [x * c - z * s, y, x * s + z * c];
};

/** HUD brackets on the hero's square: the facing side's corners bright, and a notch pointing out of it. */
function brackets(face: Facing): SVGElement {
  const [a, arm] = [29.5, 11];
  const corners: Array<[number, number]> = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  const onSide = ([sx, sy]: [number, number]) => (face === "north" ? sy < 0 : face === "south" ? sy > 0 : face === "east" ? sx > 0 : sx < 0);
  const path = (list: Array<[number, number]>) => list.map(([sx, sy]) => `M ${sx * a} ${sy * (a - arm)} V ${sy * a} H ${sx * (a - arm)}`).join(" ");
  const angle = { north: 0, east: 90, south: 180, west: 270 }[face];
  return el(
    "g",
    { class: "br" },
    el("path", { d: path(corners.filter((c) => !onSide(c))), class: "br-dim" }),
    el("path", { d: path(corners.filter(onSide)), class: "br-facing" }),
    el("path", { d: `M -4 ${-a + 1.2} L 0 ${-a - 2.2} L 4 ${-a + 1.2} Z`, class: "br-notch", transform: `rotate(${angle})` }),
  );
}

/**
 * Sprites are built once and handed out as copies: the same wall, enemy or hero is needed by every tile of
 * every board, every thumbnail and every Lessons selection. (Not the goal: its gradients have ids.)
 */
const memo = new Map<string, SVGElement>();
function cached(key: string, build: () => SVGElement): SVGElement {
  let art = memo.get(key);
  if (!art) memo.set(key, (art = build()));
  return art.cloneNode(true) as SVGElement;
}

export const hero = (skin: Skin, face: Facing): SVGElement => cached(`hero:${skin}:${face}`, () => buildHero(skin, face));

function buildHero(skin: Skin, face: Facing): SVGElement {
  if (skin === "pawn") return drawHero(yaw(pawnModel("low"), PAWN_FACING[face] - VISOR), [], face);
  // the knight's head points along -x; a facing turns it, and its lit details turn with it
  const angle = KNIGHT_TURN[face];
  const lit = knightEyes.map((d) => ({ pts: d.pts.map(turn(angle)), n: turn(angle)(d.n) }));
  return drawHero(yaw(knightModel(), angle), lit, face);
}

/** The hero's drawing: brackets that show the facing, the floor shadow, and the solid model. */
function drawHero(model: Model, lit: Decal[], face: Facing): SVGElement {
  const f = fit(model, 52, 55, 27.5);
  const { c, rx, ry } = floor(f, 20);
  return el(
    "g",
    { class: "hero" },
    brackets(face),
    // the only floor shadow on the board: the hero is the only solid thing
    el("ellipse", { cx: c[0] + rx * 0.2, cy: c[1] + ry * 0.35, rx: rx * 1.1, ry: ry * 1.25, class: "s-shadow" }),
    solid(model, f, lit),
  );
}

// -- enemies ------------------------------------------------------------------------------------------

export type EnemyKind = "rook" | "bishop" | "chaser";

const ENEMIES: Record<EnemyKind, () => { shape: Shape; fitBox: [number, number, number]; lit: V3[][] }> = {
  rook: () => ({ shape: { model: rookModel("mid") }, fitBox: [52, 56, 29], lit: [rookSlit()] }),
  bishop: () => ({ shape: { model: bishopModel() }, fitBox: [50, 56, 29], lit: [bishopCut] }),
  chaser: () => ({ shape: virusModel(), fitBox: [56, 56, 25], lit: virusEyes }),
};

/**
 * An enemy: one frame held still, or "live" (at rest, breaking now and then).
 * `backlit`: a dark shape behind the wire, for the title screen, where the enemies stand against the sun.
 */
export function enemy(kind: EnemyKind, frame: Frame | "live" = "live", delay = 0, backlit = false): SVGElement {
  const art = cached(`enemy:${kind}:${frame}:${backlit}`, () => buildEnemy(kind, frame, backlit));
  // an enemy's glitch beat is only a CSS variable, so copies of one drawing can each have their own
  if (frame === "live") art.querySelector<SVGElement>(".bw-live")?.style.setProperty("--glitch-delay", `${delay}s`);
  return art;
}

function buildEnemy(kind: EnemyKind, frame: Frame | "live", backlit: boolean): SVGElement {
  const { shape, fitBox, lit } = ENEMIES[kind]();
  const f = fitShape(shape, ...fitBox);
  const group = el("g", { class: "enemy-art" });
  if (backlit) group.append(el("g", { class: "bw-backing" }, ...shape.model.faces.map((x) => el("polygon", { points: pts(x.pts.map((q) => project(q, f))) }))));
  group.append(frame === "live" ? live(shape, f, lit, 0) : broken(shape, f, frame, lit));
  return group;
}

// -- tiles ----------------------------------------------------------------------------------------------

export type TileName = "wall" | "sign" | "rune" | "gate" | "gateTimed" | "gateOpen" | "pit" | "plank" | "waypoint" | "waypointDone" | "gem";

const GATE_FIT = fitShape(gateShape("guarded"), 54, 56, 28);

export const tile = (name: TileName): SVGElement => cached(`tile:${name}`, () => buildTile(name));

function buildTile(name: TileName): SVGElement {
  switch (name) {
    case "wall": {
      const model = wallModel();
      return wire({ model, lines: brickLines() }, fit(model, 56, 50, 27), "wall");
    }
    case "sign": {
      const shape = signShape();
      const f = fitShape(shape, 48, 52, 27);
      // the post is structure (violet); the screen and its text are the world's words (green)
      const post: Shape = { model: { faces: shape.model.faces.filter((x) => x.part === "post"), contour: [] } };
      const board: Shape = { model: { faces: shape.model.faces.filter((x) => x.part !== "post"), contour: [] }, lines: shape.lines };
      return el("g", {}, wire(post, f, "wall"), wire(board, f, "green"));
    }
    case "rune": {
      const shape = runeShape();
      return wire(shape, fitShape(shape, 50, 26, 16), "green");
    }
    case "gate":
      return wire(gateShape("guarded"), GATE_FIT, "amber");
    case "gateTimed":
      return wire(gateShape("timed"), GATE_FIT, "amber");
    case "gateOpen":
      return wire(gateShape("open"), GATE_FIT, "amber");
    case "pit": {
      const shape = pitShape();
      return wire(shape, fitShape(shape, 56, 44, 25), "wall", { voidFaces: true });
    }
    case "plank": {
      const shape = plankShape();
      return wire(shape, fitShape(shape, 52, 22, 10), "amber");
    }
    case "waypoint":
    case "waypointDone": {
      const todo = waypointShape(false);
      const f = fitShape(todo, 40, 50, 24);
      return name === "waypoint" ? wire(todo, f, "amber") : wire(waypointShape(true), f, "green");
    }
    case "gem": {
      const shape = gemShape();
      return wire(shape, fitShape(shape, 30, 46, 22), "amber");
    }
  }
}

/** The goal: the board's one beacon. A wire flag on a lit pad, with a column of light rising from it. */
export function goal(): SVGElement {
  const shape = beaconShape();
  const f = fitShape(shape, 46, 52, 26);
  const { c, rx, ry } = floor(f, 20);
  const [column, pad] = [uid("column"), uid("pad")];
  return el(
    "g",
    { class: "beacon" },
    el(
      "defs",
      {},
      el("linearGradient", { id: column, x1: 0, y1: 1, x2: 0, y2: 0 }, el("stop", { offset: "0%", class: "beacon-column-base" }), el("stop", { offset: "100%", class: "beacon-column-top" })),
      el("radialGradient", { id: pad }, el("stop", { offset: "0%", class: "beacon-pad-in" }), el("stop", { offset: "100%", class: "beacon-pad-out" })),
    ),
    el("ellipse", { cx: c[0], cy: c[1], rx: rx * 1.15, ry: ry * 1.15, fill: `url(#${pad})` }),
    el("rect", { x: c[0] - 11, y: -32, width: 22, height: c[1] + 32, fill: `url(#${column})` }),
    wire(shape, f, "amber"),
  );
}

/** A chapter's victory symbol: a wire crown; mastery adds a lit jewel and two sparks. */
export function crown(mastered: boolean): SVGElement {
  const group = el(
    "g",
    { class: "w w-amber crown" },
    el("path", { d: "M -22 10 L -24 -10 L -12 0 L 0 -16 L 12 0 L 24 -10 L 22 10 Z", class: "wf" }),
    el("path", { d: "M -22 10 H 22 M -21 4 H 21 M -24 -10 L -22 10 M 0 -16 V 4", class: "wl" }),
  );
  if (mastered) {
    group.append(el("rect", { x: -3.5, y: -4, width: 7, height: 6, class: "crown-jewel" }), el("path", { d: "M -28 -20 v 6 M -31 -17 h 6 M 28 -22 v 6 M 25 -19 h 6", class: "crown-spark" }));
  }
  return group;
}

// -- the registry -------------------------------------------------------------------------------------

/** The sprite each kind of tile is drawn with (a floor has none). The board adds a gate's open state, a waypoint's crossed one. */
export const TILE_SPRITE: Record<Exclude<TileKind, "floor">, TileName> = {
  wall: "wall",
  sign: "sign",
  rune: "rune",
  gate: "gate",
  timed_gate: "gateTimed",
  pit: "pit",
  plank: "plank",
  waypoint: "waypoint",
  gem: "gem",
};

/** The sprite each kind of enemy is drawn with: patrols and chasers are both the faceted virus. */
export const ENEMY_SPRITE: Record<Enemy["kind"], EnemyKind> = { patrol: "chaser", chaser: "chaser", rook: "rook", bishop: "bishop" };
