// Every model of the look: each piece and tile as a mesh (faces) plus loose 3D lines (bars,
// text, glyphs). The world is drawn as wire, the hero as solid, enemies as broken wire (draw.ts).
import { box, lathe, merge, type Face, type Model, type V3 } from "./mesh";

export interface Shape {
  model: Model;
  lines?: Array<[V3, V3]>;
}

const NO_CONTOUR = { contour: [] as V3[][] };

/** A polygon in the x/y plane, extruded from z0 to z1: front, back and side faces. */
export function extrude(outline: Array<[number, number]>, z0: number, z1: number, part = "body"): Model {
  const faces: Face[] = [
    { pts: outline.map(([x, y]): V3 => [x, y, z1]), n: [0, 0, 1], part },
    { pts: [...outline].reverse().map(([x, y]): V3 => [x, y, z0]), n: [0, 0, -1], part },
  ];
  // the outline's own winding decides which way a side faces; test it against the middle
  const cx = outline.reduce((s, p) => s + p[0], 0) / outline.length;
  const cy = outline.reduce((s, p) => s + p[1], 0) / outline.length;
  outline.forEach(([x0, y0], i) => {
    const [x1, y1] = outline[(i + 1) % outline.length]!;
    let [nx, ny] = [y1 - y0, -(x1 - x0)];
    const len = Math.hypot(nx, ny) || 1;
    [nx, ny] = [nx / len, ny / len];
    if (nx * ((x0 + x1) / 2 - cx) + ny * ((y0 + y1) / 2 - cy) < 0) [nx, ny] = [-nx, -ny];
    faces.push({ pts: [[x0, y0, z0], [x1, y1, z0], [x1, y1, z1], [x0, y0, z1]], n: [nx, ny, 0], part });
  });
  return { faces, ...NO_CONTOUR };
}

const ring = (r: number, y: number, n = 8, phase = Math.PI / 8): V3[] => Array.from({ length: n }, (_, i) => [r * Math.cos(phase + (i * 2 * Math.PI) / n), y, r * Math.sin(phase + (i * 2 * Math.PI) / n)]);
const loop = (pts: V3[]): Array<[V3, V3]> => pts.map((p, i) => [p, pts[(i + 1) % pts.length]!]);

// -- pieces ------------------------------------------------------------------------------------

/** The bishop: a lathe body and mitre with a finial; its cut is a decal (see bishopCut). */
export function bishopModel(): Model {
  const profile: Array<[number, number]> = [[0, 19], [3.5, 19], [6, 15.5], [9, 12.5], [20, 8.6], [22, 11.6], [25, 11.6], [26.5, 7.2], [28.5, 8.4], [32, 10.6], [37, 11.3], [42, 10.1], [47, 7.4], [50.5, 3.6], [52, 0]];
  return merge(lathe(profile, 12), box([-1.6, 1.6], [51, 55], [-1.6, 1.6]));
}

/** The bishop's slanted cut across the front of its mitre, a hair proud of the surface. */
export const bishopCut: V3[] = [[1.5, 46, 9.4], [4.8, 44.5, 8.2], [-2.5, 33, 10.6], [-5.6, 35, 9.6]];

/** A patrol or chaser: a faceted virus, an octahedron hovering above the floor with spikes. */
export function virusModel(): Shape {
  const [cy, r] = [26, 17];
  const top: V3 = [0, cy + r, 0];
  const bottom: V3 = [0, cy - r, 0];
  const mid = ring(r, cy, 4, 0.5);
  const faces: Face[] = [];
  mid.forEach((a, i) => {
    const b = mid[(i + 1) % 4]!;
    for (const tip of [top, bottom]) {
      const pts: V3[] = [a, b, tip];
      const c: V3 = [(a[0] + b[0] + tip[0]) / 3, (a[1] + b[1] + tip[1]) / 3 - cy, (a[2] + b[2] + tip[2]) / 3];
      const l = Math.hypot(...c) || 1;
      faces.push({ pts, n: [c[0] / l, c[1] / l, c[2] / l], part: "body" });
    }
  });
  const spike = (p: V3): [V3, V3] => [p, [p[0] * 1.42, cy + (p[1] - cy) * 1.42, p[2] * 1.42]];
  return { model: { faces, contour: [] }, lines: [...mid, top, bottom].map(spike) };
}

/** Its two eyes, which don't quite agree: small quads on the front faces. */
export const virusEyes: V3[][] = [
  [[-8, 31, 9.5], [-3, 31, 11.5], [-3, 28, 11.8], [-8, 28, 9.8]],
  [[3, 30, 11.5], [8, 30, 9.5], [8, 27.5, 9.8], [3, 27.5, 11.8]],
];

/**
 * The knight skin: a horse-head helm in profile, extruded, on the pawn's plinth.
 * Its head points along -x; turning it (yaw) makes it face the other ways.
 */
export function knightModel(): Model {
  const head: Array<[number, number]> = [[-11, 10], [-12.5, 20], [-9, 27], [-19, 30], [-24, 33.5], [-23.5, 40], [-15, 46.5], [-7, 52], [-4.5, 59], [-0.5, 52.5], [6, 50.5], [10.5, 41], [12.5, 28], [13.5, 10]];
  const base: Array<[number, number]> = [[0, 19], [3.5, 19], [6, 15.5], [10, 13.5], [10.5, 0]];
  return merge(lathe(base, 8), extrude(head, -6.5, 6.5));
}

/** The knight's lit eye-slit, on both sides of the helm, each with the way its side faces. */
export const knightEyes: Array<{ pts: V3[]; n: V3 }> = [
  { pts: [[-17, 41.5, 6.7], [-10, 43.5, 6.7], [-10, 41, 6.7], [-17, 39.5, 6.7]], n: [0, 0, 1] },
  { pts: [[-17, 41.5, -6.7], [-10, 43.5, -6.7], [-10, 41, -6.7], [-17, 39.5, -6.7]], n: [0, 0, -1] },
];

// -- tiles ---------------------------------------------------------------------------------------

/** A signpost: a screen on a post, with lines of text on its face. */
export function signShape(): Shape {
  const text: Array<[number, number, number]> = [[38, -14, 12], [32, -14, 6], [26, -14, 10]];
  return {
    model: merge(box([-1.6, 1.6], [0, 22], [-1.6, 1.6], "post"), box([-19, 19], [20, 44], [-2.5, 2.5])),
    lines: text.map(([y, x0, x1]): [V3, V3] => [[x0, y, 2.6], [x1, y, 2.6]]),
  };
}

/** A rune: a low slab on the floor with a prompt, >_, on its top. */
export function runeShape(): Shape {
  const y = 5.1;
  return {
    model: box([-22, 22], [0, 5], [-16, 16]),
    lines: [
      [[-13, y, -7], [-4, y, 0]],
      [[-4, y, 0], [-13, y, 7]],
      [[1, y, 7], [13, y, 7]],
    ],
  };
}

/** A gate: two posts, a lintel and bars. Guarded gates have a padlock; timed ones tick marks; open ones lift the bars. */
export function gateShape(kind: "guarded" | "timed" | "open"): Shape {
  const posts = merge(box([-25, -20], [0, 46], [-3, 3]), box([20, 25], [0, 46], [-3, 3]), box([-25, 25], [40, 46], [-3, 3]));
  const [low, high] = kind === "open" ? [33, 40] : [0, 40];
  const lines: Array<[V3, V3]> = [-14, -7, 0, 7, 14].map((x): [V3, V3] => [[x, low, 0], [x, high, 0]]);
  if (kind !== "open") lines.push([[-20, 30, 0], [20, 30, 0]], [[-20, 10, 0], [20, 10, 0]]);
  if (kind === "guarded") {
    const shackle: V3[] = [[-3, 24, 4.5], [-3, 27.5, 4.5], [-1.5, 29, 4.5], [1.5, 29, 4.5], [3, 27.5, 4.5], [3, 24, 4.5]];
    shackle.slice(1).forEach((p, i) => lines.push([shackle[i]!, p]));
    return { model: merge(posts, box([-4.5, 4.5], [15, 24], [3, 6], "lock")), lines };
  }
  if (kind === "timed") for (const x of [-15, -9, -3, 3, 9, 15]) lines.push([[x, 41.5, 3.1], [x, 44.5, 3.1]]);
  return { model: posts, lines };
}

/** A pit: a funnel of rings falling away below the floor. Its rim is drawn filled with the void. */
export function pitShape(): Shape {
  const levels: Array<[number, number]> = [[0, 25], [-7, 18], [-14, 12], [-20, 7]];
  const rings = levels.map(([y, r]) => ring(r, y));
  const lines: Array<[V3, V3]> = rings.flatMap(loop);
  for (let i = 0; i + 1 < rings.length; i++) rings[i]!.forEach((p, j) => lines.push([p, rings[i + 1]![j]!]));
  const rim = rings[0]!;
  return { model: { faces: [{ pts: rim, n: [0, 1, 0], part: "rim" }], contour: [] }, lines };
}

export function plankShape(): Shape {
  return {
    model: box([-25, 25], [0, 3.5], [-6.5, 6.5]),
    lines: [
      [[-20, 3.6, -2.2], [16, 3.6, -2.2]],
      [[-14, 3.6, 2.2], [20, 3.6, 2.2]],
    ],
  };
}

/** A waypoint: an upright diamond over a small ring on the floor. Crossed, it holds a check mark. */
export function waypointShape(crossed: boolean): Shape {
  const d = (s: number): V3[] => [[0, 22 + s, 0], [s, 22, 0], [0, 22 - s, 0], [-s, 22, 0]];
  const [outer, inner] = [d(15), d(10)];
  const lines: Array<[V3, V3]> = [...loop(outer), ...loop(inner), ...outer.map((p, i): [V3, V3] => [p, inner[i]!]), ...loop(ring(10, 0))];
  if (crossed) lines.push([[-5, 22, 0], [-1.5, 18, 0]], [[-1.5, 18, 0], [6, 27, 0]]);
  // an invisible face, so the shape has bounds to fit by
  return { model: { faces: [{ pts: outer, n: [0, 0, 1], part: "ghost" }], contour: [] }, lines };
}

/** A gem: a faceted octahedron floating above the floor. */
export function gemShape(): Shape {
  const top: V3 = [0, 34, 0];
  const bottom: V3 = [0, 8, 0];
  const mid = ring(12, 24, 4, 0.45);
  const faces: Face[] = mid.flatMap((a, i) => {
    const b = mid[(i + 1) % 4]!;
    return [top, bottom].map((tip): Face => {
      const c: V3 = [(a[0] + b[0] + tip[0]) / 3, (a[1] + b[1] + tip[1]) / 3 - 22, (a[2] + b[2] + tip[2]) / 3];
      const l = Math.hypot(...c) || 1;
      return { pts: [a, b, tip], n: [c[0] / l, c[1] / l, c[2] / l], part: "body" };
    });
  });
  return { model: { faces, contour: [] }, lines: loop(ring(7, 0)) };
}

/** The goal: a flag on a lit pad. Its column of light is drawn on top (see sprites.ts). */
export function beaconShape(): Shape {
  const pennant: Array<[number, number]> = [[1.4, 50], [23, 43.5], [1.4, 37]];
  return {
    model: merge(box([-1.4, 1.4], [0, 50], [-1.4, 1.4], "pole"), extrude(pennant, -1, 1, "flag")),
    lines: [...loop(ring(20, 0, 12, 0)), ...loop(ring(13, 0, 12, 0))],
  };
}

/** A wall's brick courses, on its front face (z = 26), as lines. */
export function brickLines(): Array<[V3, V3]> {
  const z = 26.05;
  const rows = [0, 6.3, 12.6, 19];
  const joints = [[-8, 10], [-17, 1, 19], [-8, 10]];
  const lines: Array<[V3, V3]> = rows.slice(1, -1).map((y): [V3, V3] => [[-26, y, z], [26, y, z]]);
  joints.forEach((xs, i) => xs.forEach((x) => lines.push([[x, rows[i]!, z], [x, rows[i + 1]!, z]])));
  return lines;
}
