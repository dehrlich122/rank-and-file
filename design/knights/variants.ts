// M3.7 step 3 follow-up (design prototype): three redesigns of the knight skin. The style is the approved one
// (solid, flat-shaded, glowing outline); what changes is the silhouette, which has to be interesting from every
// side, the back above all. Every model's head points along -x and sits on the pawn's plinth.
import { box, lathe, merge, type Face, type Model, type V3 } from "../../src/ui/sprites/mesh";
import { extrude } from "../../src/ui/sprites/models";
import type { Decal } from "../../src/ui/sprites/draw";

export interface Variant {
  name: string;
  blurb: string;
  model: Model;
  lit: Decal[];
}

// -- helpers -------------------------------------------------------------------------------------------

const norm = ([x, y, z]: V3): V3 => {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
};
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** A face from points, its normal worked out and flipped to point away from `inside`. */
function face(pts: V3[], inside: V3, part = "body"): Face {
  let n = norm(cross(sub(pts[1]!, pts[0]!), sub(pts[2]!, pts[0]!)));
  const c = pts.reduce<V3>((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length, s[2] + p[2] / pts.length], [0, 0, 0]);
  if (n[0] * (c[0] - inside[0]) + n[1] * (c[1] - inside[1]) + n[2] * (c[2] - inside[2]) < 0) n = [-n[0], -n[1], -n[2]];
  return { pts, n, part };
}

/** A four-sided spike: a rectangle on the floor y0 at (cx, cz), half-sizes w and d, rising to `apex`. */
function spike(cx: number, y0: number, cz: number, w: number, d: number, apex: V3, part = "body"): Model {
  const base: V3[] = [[cx - w, y0, cz - d], [cx + w, y0, cz - d], [cx + w, y0, cz + d], [cx - w, y0, cz + d]];
  const inside: V3 = [cx, y0 + (apex[1] - y0) * 0.3, cz];
  const faces = base.map((p, i) => face([p, base[(i + 1) % 4]!, apex], inside, part));
  faces.push(face(base, apex, part));
  return { faces, contour: [] };
}

/** Turn a model about the z axis through (px, py), by `angle`: a tilt in the head's own plane. */
function tilt(model: Model, angle: number, px: number, py: number): Model {
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  const p = ([x, y, z]: V3): V3 => [px + (x - px) * c - (y - py) * s, py + (x - px) * s + (y - py) * c, z];
  const n = ([x, y, z]: V3): V3 => [x * c - y * s, x * s + y * c, z];
  return { faces: model.faces.map((f) => ({ ...f, pts: f.pts.map(p), n: n(f.n) })), contour: [] };
}

/** Turn a model about the y axis through (px, pz). */
function spin(model: Model, angle: number, px: number, pz: number): Model {
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  const p = ([x, y, z]: V3): V3 => [px + (x - px) * c - (z - pz) * s, y, pz + (x - px) * s + (z - pz) * c];
  const n = ([x, y, z]: V3): V3 => [x * c - z * s, y, x * s + z * c];
  return { faces: model.faces.map((f) => ({ ...f, pts: f.pts.map(p), n: n(f.n) })), contour: [] };
}

/** A flat fin standing in the head's plane: a triangle from `a` out to `tip` and back to `b`, thickness t. */
const fin = (a: [number, number], b: [number, number], tip: [number, number], t: number, part = "body"): Model => extrude([a, tip, b], -t, t, part);

const BASE = lathe([[0, 19], [3.5, 19], [6, 15.5], [10, 13.5], [10.5, 0]], 8);

/** The horse-head helm in profile (the first knight's), as an outline. */
const HEAD: Array<[number, number]> = [[-11, 10], [-12.5, 20], [-9, 27], [-19, 30], [-24, 33.5], [-23.5, 40], [-15, 46.5], [-7, 52], [-4.5, 59], [-0.5, 52.5], [6, 50.5], [10.5, 41], [12.5, 28], [13.5, 10]];

/** Points along the back of the neck, from the poll down to the shoulders. */
const NECK: Array<[number, number]> = [[-1, 55], [4, 51], [8, 45.5], [10.5, 39], [12, 32], [12.8, 25], [13.4, 18]];

/** A lit eye on each cheek, `z` out from the middle. */
const eyes = (z: number, x0 = -17, y = 41.5): Decal[] => [
  { pts: [[x0, y, z], [x0 + 7, y + 2, z], [x0 + 7, y - 0.5, z], [x0, y - 2, z]], n: [0, 0, 1] },
  { pts: [[x0, y, -z], [x0 + 7, y + 2, -z], [x0 + 7, y - 0.5, -z], [x0, y - 2, -z]], n: [0, 0, -1] },
];

// -- 1. the crested helm -----------------------------------------------------------------------------------

/** A horse-head helm with a ridge of tall fins down its neck, pauldrons, ears and a brow: busy from behind. */
function crested(): Variant {
  const mane = NECK.flatMap(([x, y], i) => {
    const h = 11 - i * 0.9;
    return [fin([x - 1.5, y + 3], [x + 0.5, y - 3.5], [x + 4 + h * 0.7, y + h * 0.9], 1.5, "mane")];
  });
  const model = merge(
    BASE,
    extrude(HEAD, -7, 7),
    extrude([[-19, 30], [-24, 33.5], [-23.5, 40], [-15, 44], [-9, 33]], -9.5, 9.5, "cheek"),
    box([-17, -7], [44, 47.5], [-9, 9], "brow"),
    extrude([[-8, 51], [-7, 62], [-3.5, 52]], 3, 5.2, "ear"),
    extrude([[-8, 51], [-7, 62], [-3.5, 52]], -5.2, -3, "ear"),
    ...mane,
    box([-1, 15], [12, 22], [-14, 14], "pauldron"),
    box([1, 13], [22, 25], [-12, 12], "pauldron"),
  );
  return { name: "Crested helm", blurb: "A mane of fins down the neck, pauldrons, ears, a brow: a ridge from behind.", model, lit: eyes(9.7) };
}

// -- 2. the cavalier -------------------------------------------------------------------------------------------

/** A slimmer helm with a fan of plume fins and a standing cloak plate with a lit sigil on its back. */
function cavalier(): Variant {
  const plume = [-0.9, -0.45, 0, 0.45, 0.9].map((a) => spin(fin([-2, 54], [2, 52], [11 + Math.abs(a) * -6, 70 - Math.abs(a) * 8], 1.1, "plume"), a, 1, 0));
  const cape = tilt(box([12, 17], [10, 46], [-12, 12], "cape"), -0.1, 12, 10);
  const model = merge(
    BASE,
    extrude(HEAD, -5.5, 5.5),
    extrude([[-20, 31], [-24, 34], [-23.5, 40], [-16, 43.5], [-10, 33]], -7.5, 7.5, "cheek"),
    box([-9, 5], [53, 57], [-6.5, 6.5], "crown"),
    ...plume,
    cape,
    box([-2, 15], [11, 19], [-14, 14], "pauldron"),
    box([2, 12], [11, 14], [-16, 16], "pauldron"),
  );
  // the sigil on the cloak's back face: a lit diamond over a bar, facing +x (tilted with the cloak)
  const [c, s] = [Math.cos(-0.1), Math.sin(-0.1)];
  const onCape = (y: number, z: number): V3 => [12 + 5.2 * c - (y - 10) * s + 0, 10 + 5.2 * s + (y - 10) * c, z];
  const sigil: Decal = { pts: [onCape(34, 0), onCape(28, 5), onCape(22, 0), onCape(28, -5)], n: [c, s, 0] };
  const bar: Decal = { pts: [onCape(19, -6), onCape(19, 6), onCape(16.5, 6), onCape(16.5, -6)], n: [c, s, 0] };
  return { name: "Cavalier", blurb: "A fan of plume fins and a standing cloak with a lit sigil on its back.", model, lit: [...eyes(7.7), sigil, bar] };
}

// -- 3. the charger -----------------------------------------------------------------------------------------------

/** A long lit horn, spikes up the back of the neck and a spiked tail: every side has a silhouette. */
function charger(): Variant {
  const horn = tilt(spike(-14, 0, 0, 3.4, 3.4, [-14, 20, 0], "horn"), 1.15, -14, 0);
  const hornAt = (m: Model, dx: number, dy: number): Model => ({ faces: m.faces.map((f) => ({ ...f, pts: f.pts.map(([x, y, z]): V3 => [x + dx, y + dy, z]) })), contour: [] });
  const spines = NECK.filter((_, i) => i % 2 === 0).map(([x, y], i) => spike(x + 1, y - 1, 0, 3.2 - i * 0.3, 3.2 - i * 0.3, [x + 8 - i, y + 12 - i * 1.5, 0], "spine"));
  const tail = [0, 1, 2].map((i) => spike(21 + i * 5, 4 + i * 4.5, 0, 3.6 - i * 0.9, 3.6 - i * 0.9, [30 + i * 5.5, 10 + i * 9, 0], "tail"));
  const model = merge(
    BASE,
    extrude(HEAD, -6, 6),
    extrude([[-19, 30], [-24, 33.5], [-23.5, 40], [-15, 44], [-9, 33]], -8, 8, "cheek"),
    extrude([[-8, 51], [-7, 60], [-3.5, 52]], 2.5, 4.5, "ear"),
    extrude([[-8, 51], [-7, 60], [-3.5, 52]], -4.5, -2.5, "ear"),
    hornAt(horn, -1, 47),
    ...spines,
    ...tail,
    box([1, 14], [12, 18], [-12, 12], "pauldron"),
  );
  // the horn's lit tip, on the side faces: a small sliver near the point
  const tip: Decal[] = [1, -1].map((side) => ({ pts: [[-30, 62, 3.5 * side], [-33, 64, 0.4 * side], [-30.5, 62.5, 0.4 * side]] as V3[], n: [0, 0, side] as V3 }));
  return { name: "Charger", blurb: "A long horn, spikes up the neck and a spiked tail: spiky from every side.", model, lit: [...eyes(8.2), ...tip] };
}

export const VARIANTS: Array<() => Variant> = [crested, cavalier, charger];
