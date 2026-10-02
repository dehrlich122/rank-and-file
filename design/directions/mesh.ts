// M3.7 step 0, round 3 (design prototype, never shipped): a tiny 3D mesh kit.
//
// Pieces are turned on a lathe from a profile (height, radius), with a few boxes
// added (the pawn's crest, the rook's merlons), then seen in a 3/4 view from
// above and the front. Three of the four directions draw these same kinds of
// model in different ways: as wire (A), as lit solid faces (B), as light (D).
// All units are one board square = 64, and a model is fitted into its square.

export type V3 = [number, number, number]; // x right, y up, z toward the viewer
export type Pt = [number, number]; // screen units

/** One flat face. `part` lets a look colour the visor, the crest or the rook's slit differently. */
export interface Face {
  pts: V3[];
  n: V3; // outward normal
  part: string;
}

export interface Model {
  faces: Face[];
  /** The left and right edges of the turned body, for an outline. */
  contour: V3[][];
}

const TILT = (24 * Math.PI) / 180; // how far we look down on the board
const COS = Math.cos(TILT);
const SIN = Math.sin(TILT);
const LIGHT: V3 = norm([-0.55, 0.72, 0.45]); // upper left, in front

function norm([x, y, z]: V3): V3 {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** How much a face turns toward the viewer: above 0 it can be seen. */
export const facing = (n: V3) => n[1] * SIN + n[2] * COS;

/** Distance toward the viewer, for drawing far faces first. */
export const depth = ([, y, z]: V3) => z * COS + y * SIN;

/** Lambert light on a face, 0 to 1. */
export const light = (n: V3) => Math.max(0, dot(n, LIGHT));

const polar = (r: number, h: number, a: number): V3 => [r * Math.cos(a), h, r * Math.sin(a)];

/**
 * A body turned from `profile`: [height, radius] from the bottom up, in `segments`
 * facets. `tag(row, angle)` names the part a facet belongs to.
 */
function lathe(profile: Array<[number, number]>, segments: number, tag: (h0: number, h1: number, mid: number) => string = () => "body"): Model {
  const faces: Face[] = [];
  const step = (2 * Math.PI) / segments;
  for (let i = 0; i + 1 < profile.length; i++) {
    const [h0, r0] = profile[i]!;
    const [h1, r1] = profile[i + 1]!;
    // the profile's outward normal (radial, up), turned around the axis per facet
    const dr = r1 - r0;
    const dh = h1 - h0;
    const len = Math.hypot(dr, dh) || 1;
    const [nr, nh] = [dh / len, -dr / len];
    for (let j = 0; j < segments; j++) {
      const a0 = j * step;
      const a1 = a0 + step;
      const mid = a0 + step / 2;
      const pts: V3[] = [polar(r0, h0, a0), polar(r0, h0, a1), polar(r1, h1, a1), polar(r1, h1, a0)].filter((p, k, all) => k === 0 || p.some((v, d) => Math.abs(v - all[k - 1]![d]!) > 1e-6));
      faces.push({ pts, n: norm([nr * Math.cos(mid), nh, nr * Math.sin(mid)]), part: tag(h0, h1, mid) });
    }
  }
  const [hTop, rTop] = profile[profile.length - 1]!;
  if (rTop > 0) {
    const ring = Array.from({ length: segments }, (_, j): V3 => polar(rTop, hTop, j * step));
    faces.push({ pts: ring, n: [0, 1, 0], part: "cap" });
  }
  const contour = [-1, 1].map((side) => profile.map(([h, r]): V3 => [side * r, h, 0]));
  return { faces, contour };
}

/** A box, axis-aligned: [x0, x1], [y0, y1], [z0, z1]. */
function box(x: [number, number], y: [number, number], z: [number, number], part = "body"): Model {
  const [x0, x1] = x;
  const [y0, y1] = y;
  const [z0, z1] = z;
  const f = (pts: V3[], n: V3): Face => ({ pts, n, part });
  return {
    faces: [
      f([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], [0, 1, 0]),
      f([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]),
      f([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], [0, 0, -1]),
      f([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0]),
      f([[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], [1, 0, 0]),
    ],
    contour: [],
  };
}

/** A curved block on a ring, from angle a0 to a1 and radius r0 to r1: a merlon. */
function sector(a: [number, number], r: [number, number], h: [number, number], part = "body"): Model {
  const [a0, a1] = a;
  const [r0, r1] = r;
  const [h0, h1] = h;
  const am = (a0 + a1) / 2;
  const faces: Face[] = [];
  const steps = 2;
  for (let k = 0; k < steps; k++) {
    const b0 = a0 + ((a1 - a0) * k) / steps;
    const b1 = a0 + ((a1 - a0) * (k + 1)) / steps;
    const bm = (b0 + b1) / 2;
    faces.push({ pts: [polar(r1, h0, b0), polar(r1, h0, b1), polar(r1, h1, b1), polar(r1, h1, b0)], n: [Math.cos(bm), 0, Math.sin(bm)], part });
    faces.push({ pts: [polar(r0, h0, b0), polar(r0, h0, b1), polar(r0, h1, b1), polar(r0, h1, b0)], n: [-Math.cos(bm), 0, -Math.sin(bm)], part });
  }
  faces.push({ pts: [polar(r0, h1, a0), polar(r1, h1, a0), polar(r1, h1, am), polar(r1, h1, a1), polar(r0, h1, a1), polar(r0, h1, am)], n: [0, 1, 0], part });
  faces.push({ pts: [polar(r0, h0, a0), polar(r1, h0, a0), polar(r1, h1, a0), polar(r0, h1, a0)], n: [Math.sin(a0), 0, -Math.cos(a0)], part });
  faces.push({ pts: [polar(r0, h0, a1), polar(r1, h0, a1), polar(r1, h1, a1), polar(r0, h1, a1)], n: [-Math.sin(a1), 0, Math.cos(a1)], part });
  return { faces, contour: [] };
}

const merge = (...models: Model[]): Model => ({ faces: models.flatMap((m) => m.faces), contour: models.flatMap((m) => m.contour) });

/** Turn a model about its upright axis (so a piece can face a little to one side). */
export function yaw(model: Model, angle: number): Model {
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  const turn = ([x, y, z]: V3): V3 => [x * c - z * s, y, x * s + z * c];
  // a turned body looks the same from every side, so its outline doesn't turn
  return { faces: model.faces.map((f) => ({ ...f, pts: f.pts.map(turn), n: turn(f.n) })), contour: model.contour };
}

/** How a model sits in its square: a uniform scale and an offset, so it fills the square without leaving it. */
export interface Fit {
  k: number;
  ox: number;
  oy: number;
}

const raw = ([x, y, z]: V3): Pt => [x, -y * COS + z * SIN];

/** Fit a model into the square around (0, 0): at most `w` wide and `h` tall, its bottom at `bottom`. */
export function fit(model: Model, w = 54, h = 58, bottom = 29): Fit {
  const pts = model.faces.flatMap((f) => f.pts.map(raw));
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = Math.min(w / (maxX - minX), h / (maxY - minY));
  return { k, ox: -((minX + maxX) / 2) * k, oy: bottom - maxY * k };
}

export const project = (v: V3, f: Fit): Pt => {
  const [x, y] = raw(v);
  return [f.ox + x * f.k, f.oy + y * f.k];
};

export const pts = (points: Pt[]) => points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");

/** The point on the floor under a model's axis, and the floor radius there (for a shadow or a base ring). */
export function floor(f: Fit, radius: number): { c: Pt; rx: number; ry: number } {
  return { c: project([0, 0, 0], f), rx: radius * f.k, ry: radius * f.k * SIN };
}

// -- the pieces ---------------------------------------------------------------------------

/**
 * The pawn: a chess pawn's outline, worn as armour. A wide base, a tapering body,
 * a collar like shoulders, and a round helm with a visor band and a crest.
 * `detail`: "high" for smooth looks, "low" for the chunky low-poly one.
 */
export function pawnModel(detail: "high" | "mid" | "low"): Model {
  const profile: Array<[number, number]> =
    detail === "low"
      ? [[0, 19], [4, 19], [7, 15], [24, 8.6], [25.5, 13], [29, 13], [31, 8], [34, 8.6], [37.5, 11], [41, 11.8], [46, 11.8], [50, 9.8], [53.5, 6.3], [56, 0]]
      : [[0, 19], [3.5, 19], [6, 16], [9, 13], [17, 10], [24, 8.4], [25.5, 12.6], [28.5, 12.6], [30.5, 7.7], [33.5, 7.9], [36, 9.7], [38.5, 10.9], [41, 11.5], [46, 11.4], [49, 10.4], [51.5, 8.6], [53.5, 6], [55, 3.1], [55.7, 0]];
  const segments = detail === "low" ? 8 : detail === "mid" ? 12 : 20;
  // the visor: the helm's band between 41 and 46, on the front half (z > 0 is toward us)
  const tag = (h0: number, h1: number, mid: number) => (h0 >= 41 && h1 <= 46.01 && Math.sin(mid) > 0.35 ? "visor" : h0 >= 33 ? "helm" : "body");
  const crest = box([-1.4, 1.4], [53, 60.5], [-8, 4], "crest");
  return yaw(merge(lathe(profile, segments, tag), crest), detail === "low" ? Math.PI / segments + 0.25 : 0.32);
}

/** The rook: a tower on a wide base, a flange and six merlons; a lit slit for an eye. */
export function rookModel(detail: "high" | "mid" | "low"): Model {
  const profile: Array<[number, number]> = [[0, 20.5], [4, 20.5], [7, 16.8], [10, 13.6], [33, 12.3], [35, 15.8], [40, 15.8]];
  const segments = detail === "low" ? 8 : detail === "mid" ? 12 : 20;
  const merlons = Array.from({ length: 6 }, (_, i) => {
    const a0 = (i * Math.PI) / 3 + 0.12;
    return sector([a0, a0 + 0.62], [11, 15.8], [40, 48], "merlon");
  });
  return yaw(merge(lathe(profile, segments), ...merlons), ROOK_YAW);
}

const ROOK_YAW = 0.28;

/** The rook's slit, on the front of its body (a quad in model space, a hair proud of the surface). */
export function rookSlit(): V3[] {
  const r = 13.4;
  const a = Math.PI / 2 + ROOK_YAW; // it turns with the rook
  return [polar(r, 17, a - 0.12), polar(r, 17, a + 0.12), polar(r, 28, a + 0.12), polar(r, 28, a - 0.12)];
}

/** A wall: a raised block filling most of its square, with a bevelled top. */
export function wallModel(): Model {
  const [w, top, bevel] = [26, 22, 3];
  const faces: Face[] = [
    ...box([-w, w], [0, top - bevel], [-w, w]).faces.filter((f) => f.n[1] !== 1),
    // the bevel: four sloped faces up to an inset top
    { pts: [[-w, top - bevel, w], [w, top - bevel, w], [w - bevel, top, w - bevel], [-w + bevel, top, w - bevel]], n: norm([0, 1, 1]), part: "bevel" },
    { pts: [[-w, top - bevel, -w], [-w, top - bevel, w], [-w + bevel, top, w - bevel], [-w + bevel, top, -w + bevel]], n: norm([-1, 1, 0]), part: "bevel" },
    { pts: [[w, top - bevel, -w], [w, top - bevel, w], [w - bevel, top, w - bevel], [w - bevel, top, -w + bevel]], n: norm([1, 1, 0]), part: "bevel" },
    { pts: [[-w + bevel, top, -w + bevel], [w - bevel, top, -w + bevel], [w - bevel, top, w - bevel], [-w + bevel, top, w - bevel]], n: [0, 1, 0], part: "top" },
  ];
  return { faces, contour: [] };
}
