// M3.7 step 0, round 4 (design prototype, never shipped): a wireframe world with
// one solid thing in it, the hero (DESIGN.md §9, "Direction decided after round 3").
//
//   hero(variant)      the solid cyan pawn: faces lit from the upper left, glowing wire edges,
//                      and the only floor shadow on the board. Three ways to make it unmistakable:
//                        1  a soft cyan light pooled on its square
//                        2  the same, plus a blinking >_ cursor that doubles as its facing pointer
//                        3  a HUD reticle on its square and a rim light: the program's cursor
//   brokenRook(frame)  the enemy as damaged magenta wire: missing segments and lines out of
//                      register even at rest; "break" tears it into offset slices with jittered
//                      vertices; "snap" is it snapping back.
import type { Facing } from "../../src/py/protocol";
import { el } from "../directions/looks";
import { depth, facing, fit, floor, light, pawnModel, project, pts, rookModel, rookSlit, yaw, type Face, type Fit, type Model, type Pt, type V3 } from "../../src/ui/sprites/mesh";

let ids = 0;
const uid = (prefix: string) => `r4-${prefix}-${++ids}`;

const centroid = (face: Face): V3 => {
  const n = face.pts.length;
  return face.pts.reduce<V3>((acc, p) => [acc[0] + p[0] / n, acc[1] + p[1] / n, acc[2] + p[2] / n], [0, 0, 0]);
};

const flat = (face: Face, f: Fit): Pt[] => face.pts.map((p) => project(p, f));

// -- the hero ---------------------------------------------------------------------------------

export type Variant = 1 | 2 | 3;

// Where the visor points after pawnModel's own turn, and where it should point for each facing:
// east and west turn it to the side (a little toward us, so it still shows), south faces us, north turns away.
const VISOR = Math.PI / 2 + 0.32;
const FACING_ANGLE: Record<Facing, number> = { east: 0.35, west: Math.PI - 0.35, south: Math.PI / 2, north: -Math.PI / 2 };

// The cursor's chevron points the way the hero faces (screen degrees, 0 = right).
const CHEVRON_TURN: Record<Facing, number> = { east: 0, south: 90, west: 180, north: -90 };

/** The solid body: a dark outline, then faces lit from the upper left, then glowing wire edges on top. */
function solidBody(model: Model, f: Fit, rim: boolean): SVGElement {
  const front = model.faces.filter((face) => facing(face.n) > 0.01).sort((a, b) => depth(centroid(a)) - depth(centroid(b)));
  const outline = el("g", { class: "h4-outline" }, ...front.map((face) => el("polygon", { points: pts(flat(face, f)) })));
  const faces = el(
    "g",
    {},
    ...front.map((face) => {
      if (face.part === "visor") return el("polygon", { points: pts(flat(face, f)), class: "h4-visor" });
      const lit = Math.round((0.16 + 0.84 * light(face.n)) * 100);
      const fill = `color-mix(in oklab, var(--hero-hi) ${lit}%, var(--hero-lo))`;
      return el("polygon", { points: pts(flat(face, f)), fill, stroke: fill, "stroke-width": 0.4 });
    }),
  );
  const wire = el("g", { class: "h4-wire" }, ...front.map((face) => el("polygon", { points: pts(flat(face, f)) })));
  const group = el("g", { class: "h4-body" }, outline, faces, wire);
  if (rim) {
    // a rim light down the shaded side: a bright edge that cuts the hero out of the board
    const right = model.contour[1];
    if (right) group.append(el("polyline", { points: pts(right.map((p) => project(p, f))), class: "h4-rim" }));
  }
  return group;
}

/** The >_ cursor beside the helm. The chevron points the way the hero faces; the underscore blinks. */
function cursor(face: Facing): SVGElement {
  return el(
    "g",
    { class: "h4-cursor", transform: "translate(22 -22)" },
    el("polyline", { points: "-2.6,-3.6 1.4,0 -2.6,3.6", class: "h4-chevron", transform: `rotate(${CHEVRON_TURN[face]})` }),
    el("rect", { x: 3.2, y: 2.4, width: 5.2, height: 1.9, class: "h4-underscore" }),
  );
}

/** HUD brackets on the hero's own square: the program's cursor. */
function reticle(): SVGElement {
  const [a, l] = [29.5, 11];
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx, sy]) => `M ${sx! * a} ${sy! * (a - l)} V ${sy! * a} H ${sx! * (a - l)}`);
  return el("path", { d: corners.join(" "), class: "h4-reticle" });
}

export function hero(variant: Variant, face?: Facing): SVGElement {
  let model = pawnModel("mid");
  if (face) model = yaw(model, FACING_ANGLE[face] - VISOR);
  const f = fit(model);
  const group = el("g", { class: `h4 h4-v${variant}` });
  const { c, rx, ry } = floor(f, 20);
  if (variant !== 3) {
    // a soft cyan light pooled on the floor around its base, spreading across its square
    const id = uid("pool");
    group.append(
      el("defs", {}, el("radialGradient", { id }, el("stop", { offset: "0%", class: "h4-pool-in" }), el("stop", { offset: "50%", class: "h4-pool-mid" }), el("stop", { offset: "100%", class: "h4-pool-out" }))),
      el("ellipse", { cx: c[0], cy: c[1] - 1, rx: 31, ry: 17, fill: `url(#${id})` }),
    );
  } else {
    group.append(reticle());
  }
  // the only floor shadow on the board: the hero is the only solid thing
  group.append(el("ellipse", { cx: c[0] + rx * 0.2, cy: c[1] + ry * 0.35, rx: rx * 1.1, ry: ry * 1.25, class: "h4-shadow" }));
  group.append(solidBody(model, f, variant === 3));
  if (variant === 2) group.append(cursor(face ?? "east"));
  return group;
}

// -- the broken rook ------------------------------------------------------------------------------

export type Frame = "rest" | "break" | "snap";

interface Edge {
  a: V3;
  b: V3;
  front: boolean;
  key: string;
}

/** Every edge of a model once, marked front if any face it borders can be seen. */
function edges(model: Model): Edge[] {
  const found = new Map<string, Edge>();
  const keyOf = (p: V3) => p.map((v) => v.toFixed(2)).join(",");
  for (const face of model.faces) {
    const seen = facing(face.n) > 0.01;
    face.pts.forEach((a, i) => {
      const b = face.pts[(i + 1) % face.pts.length]!;
      const [ka, kb] = [keyOf(a), keyOf(b)];
      const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const edge = found.get(key);
      if (edge) edge.front ||= seen;
      else found.set(key, { a, b, front: seen, key });
    });
  }
  return [...found.values()].sort((x, y) => (x.key < y.key ? -1 : 1));
}

/** A number in [0, 1) that is always the same for the same text. */
function hash(text: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

interface Damage {
  drop: number; // share of edges missing
  register: number; // share of edges drawn out of register
  jitter: number; // how far vertices shake
  slices: number; // how far each torn slice slips sideways
  split: number; // the colour-split copies' offset
}

const DAMAGE: Record<Frame, Damage> = {
  rest: { drop: 0.17, register: 0.3, jitter: 0, slices: 0, split: 1.3 },
  break: { drop: 0.26, register: 0.4, jitter: 1.5, slices: 5.5, split: 3 },
  snap: { drop: 0.2, register: 0.34, jitter: 0.35, slices: 1.2, split: 1.8 },
};

const SLICE = 7; // a torn slice's height, in screen units
const SLIP = [1, -0.8, 1.2, -0.6, 0.9, -1.1, 0.7, -0.9, 1, -0.7]; // each slice's direction and share of the slip

function wirePath(list: Edge[], f: Fit, d: Damage, dx = 0, salt = 0): { front: string; back: string } {
  const shake = (p: V3): Pt => {
    const [x, y] = project(p, f);
    if (!d.jitter) return [x, y];
    const k = p.map((v) => v.toFixed(1)).join(",");
    return [x + (hash(k, 11 + salt) - 0.5) * 2 * d.jitter, y + (hash(k, 23 + salt) - 0.5) * 2 * d.jitter];
  };
  let front = "";
  let back = "";
  for (const edge of list) {
    let [a, b] = [shake(edge.a), shake(edge.b)];
    let shift = dx;
    if (d.slices) {
      const band = Math.floor(((a[1] + b[1]) / 2 + 40) / SLICE);
      shift += (SLIP[band % SLIP.length] ?? 0) * d.slices;
    }
    if (hash(edge.key, 5) < d.register) shift += 1.3; // out of register
    a = [a[0] + shift, a[1]];
    b = [b[0] + shift, b[1]];
    const seg = `M ${a[0].toFixed(2)} ${a[1].toFixed(2)} L ${b[0].toFixed(2)} ${b[1].toFixed(2)} `;
    if (edge.front) front += seg;
    else back += seg;
  }
  return { front, back };
}

export function brokenRook(frame: Frame): SVGElement {
  const model = rookModel("mid");
  const f = fit(model, 52, 56);
  const d = DAMAGE[frame];
  // Missing segments: two holes bitten out of the mesh, plus edges lost here and there.
  // What is missing at rest stays missing in every frame; a break loses a few more.
  const holes: Array<[number, number, number]> = [[8, 6, 4.6], [-9, -22, 4]];
  const inHole = (edge: Edge) => {
    const [a, b] = [project(edge.a, f), project(edge.b, f)];
    const [mx, my] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    return holes.some(([x, y, r]) => Math.hypot(mx - x, my - y) < r);
  };
  const kept = edges(model).filter((edge) => !inHole(edge) && hash(edge.key, 1) >= DAMAGE.rest.drop && (frame === "rest" || hash(edge.key, frame === "break" ? 2 : 3) >= d.drop - DAMAGE.rest.drop));
  const main = wirePath(kept, f, d);
  const ghostA = wirePath(kept.filter((e) => e.front), f, d, -d.split, 7);
  const ghostB = wirePath(kept.filter((e) => e.front), f, d, d.split, 9);
  const group = el(
    "g",
    { class: `r4-rook r4-rook-${frame}` },
    el("path", { d: ghostA.front, class: "rk-ghost-a" }),
    el("path", { d: ghostB.front, class: "rk-ghost-b" }),
    el("path", { d: main.back, class: "rk-back" }),
    el("path", { d: main.front, class: "rk-front" }),
  );
  // its slit, lit red: it is watching
  const slit = rookSlit().map((p) => project(p, f));
  group.append(el("polygon", { points: pts(slit.map(([x, y]) => [x + (frame === "break" ? 4 : 0), y])), class: "rk-slit" }));
  if (frame !== "rest") {
    // a frame of noise: short dashes thrown off the mesh
    const count = frame === "break" ? 9 : 3;
    for (let i = 0; i < count; i++) {
      const x = (hash(`n${i}`, 31) - 0.5) * 56;
      const y = (hash(`n${i}`, 37) - 0.5) * 56;
      group.append(el("rect", { x, y, width: 2 + hash(`n${i}`, 41) * 7, height: 1.1, class: i % 2 ? "rk-noise-a" : "rk-noise-b" }));
    }
  }
  if (frame === "snap") {
    // the break's afterimage, fading as the mesh snaps back
    const after = wirePath(kept.filter((e) => e.front), f, DAMAGE.break, 0, 3);
    group.prepend(el("path", { d: after.front, class: "rk-after" }));
  }
  return group;
}

/** The rook as the board shows it: at rest, then now and then a break and a snap back (CSS times it). */
export function liveRook(): SVGElement {
  return el("g", { class: "r4-live" }, el("g", { class: "rf rf-rest" }, brokenRook("rest")), el("g", { class: "rf rf-break" }, brokenRook("break")), el("g", { class: "rf rf-snap" }, brokenRook("snap")));
}
