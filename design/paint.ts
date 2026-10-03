// M3.7 step 0 (design prototype): one interface over the two drawing styles, so
// the board, the sprite sheet, the glitch and the title screen don't care whether
// a tile draws pixel sprites (sprites.ts) or vector ones (vector.ts).
import * as P from "./sprites";
import * as V from "./vector";

const SVG = "http://www.w3.org/2000/svg";

export type SpriteName =
  | "pawn" | "knight" | "rook" | "bishop" | "blob"
  | "wall" | "sign" | "rune" | "gate" | "gateTimed" | "gateOpen" | "pit" | "plank"
  | "waypoint" | "waypointDone" | "gem" | "flag" | "crown" | "crownMaster";

/** All in SVG units, whatever the style: `band` keeps only the part between two y values. */
interface PaintOptions {
  flat?: string;
  dx?: number;
  dy?: number;
  band?: [number, number];
}

export interface Painter {
  kind: "pixel" | "vector";
  /** A sprite in its 64-unit square, top-left at (0, 0). */
  draw(name: SpriteName, options?: PaintOptions): SVGGElement;
}

const PIXEL: Record<SpriteName, P.Sprite> = {
  pawn: P.PAWN,
  knight: P.KNIGHT,
  rook: P.ROOK,
  bishop: P.BISHOP,
  blob: P.BLOB,
  wall: P.WALL,
  sign: P.SIGN,
  rune: P.RUNE,
  gate: P.GATE,
  gateTimed: P.GATE_TIMED,
  gateOpen: P.GATE_OPEN,
  pit: P.PIT,
  plank: P.PLANK,
  waypoint: P.WAYPOINT,
  waypointDone: P.WAYPOINT_DONE,
  gem: P.GEM,
  flag: P.FLAG,
  crown: P.CROWN,
  crownMaster: P.CROWN_MASTER,
};

const VECTOR: Record<SpriteName, V.VSprite> = {
  pawn: V.V_PAWN,
  knight: V.V_KNIGHT,
  rook: V.V_ROOK,
  bishop: V.V_BISHOP,
  blob: V.V_BLOB,
  wall: V.V_WALL,
  sign: V.V_SIGN,
  rune: V.V_RUNE,
  gate: V.V_GATE,
  gateTimed: V.V_GATE_TIMED,
  gateOpen: V.V_GATE_OPEN,
  pit: V.V_PIT,
  plank: V.V_PLANK,
  waypoint: V.V_WAYPOINT,
  waypointDone: V.V_WAYPOINT_DONE,
  gem: V.V_GEM,
  flag: V.V_FLAG,
  crown: V.V_CROWN,
  crownMaster: V.V_CROWN_MASTER,
};

export function pixelPainter(mode: P.Mode, overrides: Partial<Record<SpriteName, P.Sprite>> = {}): Painter {
  const set = { ...PIXEL, ...overrides };
  return {
    kind: "pixel",
    draw: (name, o = {}) =>
      P.draw(set[name], mode, {
        flat: o.flat,
        dx: (o.dx ?? 0) / 4,
        dy: (o.dy ?? 0) / 4,
        rows: o.band ? [Math.floor(o.band[0] / 4), Math.ceil(o.band[1] / 4) - 1] : undefined,
      }),
  };
}

export const vectorPainter = (): Painter => ({ kind: "vector", draw: (name, o = {}) => V.drawVector(VECTOR[name], o) });

/** A sprite centred on (0, 0), like the piece and the enemies on the board. */
const centred = P.centred;

/** Where each hero's head ends, for the idle's second frame (the head sinks a little). */
const NECK: Partial<Record<SpriteName, number>> = { pawn: 36, knight: 28 };

/** A hero with its 2-frame idle, centred on (0, 0). */
export function hero(painter: Painter, name: "pawn" | "knight"): SVGGElement {
  const group = document.createElementNS(SVG, "g");
  group.setAttribute("class", "hero");
  const a = document.createElementNS(SVG, "g");
  a.setAttribute("class", "idle-a");
  a.append(centred(painter.draw(name)));
  const b = document.createElementNS(SVG, "g");
  b.setAttribute("class", "idle-b");
  const neck = NECK[name] ?? 32;
  const frame = document.createElementNS(SVG, "g");
  frame.append(painter.draw(name, { band: [neck, 64] }), painter.draw(name, { band: [0, neck], dy: painter.kind === "pixel" ? 4 : 2 }));
  b.append(centred(frame));
  group.append(a, b);
  return group;
}

/** A tiny deterministic generator, so the glitch's noise frame is the same every time. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/**
 * An enemy's corruption layers, for its sprite (centred on (0, 0)) to sit between:
 *  - `fringe`: a static RGB-split fringe behind the sprite, shown only when motion is reduced
 *  - `under`: the glitch burst's colour-split copies, also behind it, so only their offset edges show
 *  - `over`: the burst's slice shifted sideways and a frame of noise, over it
 * The piece itself is never covered: it has to stay readable in the middle of a glitch.
 */
export function corruption(painter: Painter, name: SpriteName, seed: number): { fringe: SVGGElement; under: SVGGElement; over: SVGGElement } {
  const layer = (className: string) => {
    const g = document.createElementNS(SVG, "g");
    g.setAttribute("class", className);
    return g;
  };
  const fringe = layer("fringe");
  fringe.append(centred(painter.draw(name, { flat: "var(--glitch-a)", dx: -4 })), centred(painter.draw(name, { flat: "var(--glitch-b)", dx: 4 })));
  const under = layer("burst burst-split");
  under.append(centred(painter.draw(name, { flat: "var(--glitch-a)", dx: -8 })), centred(painter.draw(name, { flat: "var(--glitch-b)", dx: 8 })));
  const over = layer("burst");
  const slice = layer("burst-slice");
  slice.append(centred(painter.draw(name, { band: [20, 36], dx: 12 })));
  const noise = layer("burst-noise");
  const random = seeded(seed);
  for (let i = 0; i < 9; i++) {
    const rect = document.createElementNS(SVG, "rect");
    rect.setAttribute("x", String(Math.floor(random() * 14 + 1) * 4 - 32));
    rect.setAttribute("y", String(Math.floor(random() * 14 + 1) * 4 - 32));
    rect.setAttribute("width", String(4 * (1 + Math.floor(random() * 3))));
    rect.setAttribute("height", "4");
    rect.setAttribute("fill", i % 2 ? "var(--glitch-a)" : "var(--glitch-b)");
    noise.append(rect);
  }
  over.append(slice, noise);
  return { fringe, under, over };
}
