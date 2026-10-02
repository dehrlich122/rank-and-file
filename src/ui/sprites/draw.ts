// The three materials of the look (DESIGN.md §9):
//   wire()    the world: clean glowing line art, back edges dimmed
//   solid()   the hero: flat-shaded faces, no lines inside, a glowing edge on the outline only
//   broken()  enemies: wire that looks damaged at rest, with "break" and "snap" frames
// Colours are CSS custom properties only (styles.css), so both themes work.
import { svg as el } from "./svg";
import { depth, facing, fitPoints, light, project, pts, type Face, type Fit, type Model, type Pt, type V3 } from "./mesh";
import type { Shape } from "./models";

const seg = ([a, b]: [Pt, Pt]) => `M ${a[0].toFixed(2)} ${a[1].toFixed(2)} L ${b[0].toFixed(2)} ${b[1].toFixed(2)} `;

/** Fit a shape (its faces and its lines) into the square around (0, 0): at most w wide and h tall, its bottom at `bottom`. */
export function fitShape(shape: Shape, w: number, h: number, bottom: number): Fit {
  const unit: Fit = { k: 1, ox: 0, oy: 0 };
  return fitPoints([...shape.model.faces.flatMap((f) => f.pts), ...(shape.lines ?? []).flat()].map((p) => project(p, unit)), w, h, bottom);
}

interface Edge {
  a: V3;
  b: V3;
  front: boolean;
  key: string;
}

/** Every edge of a model once, marked front if any face it borders can be seen. */
function edges(model: Model, invert = false): Edge[] {
  const found = new Map<string, Edge>();
  const keyOf = (p: V3) => p.map((v) => v.toFixed(2)).join(",");
  for (const face of model.faces) {
    if (face.part === "ghost") continue;
    const seen = invert ? facing(face.n) < -0.01 : facing(face.n) > 0.01;
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

/** Clean wire, for the world: walls, gates, signs, runes, pits, planks, waypoints, gems, the goal. */
export function wire(shape: Shape, f: Fit, role: string, options: { voidFaces?: boolean } = {}): SVGElement {
  const p = (v: V3) => project(v, f);
  const list = edges(shape.model);
  const group = el("g", { class: `w w-${role}` });
  if (options.voidFaces) {
    // a hole: its rim is filled with the void, so it reads as an opening, not a drawing
    for (const face of shape.model.faces) group.append(el("polygon", { points: pts(face.pts.map(p)), class: "wv" }));
  }
  group.append(
    el("path", { d: list.filter((e) => !e.front).map((e) => seg([p(e.a), p(e.b)])).join(""), class: "wb" }),
    el("path", { d: list.filter((e) => e.front).map((e) => seg([p(e.a), p(e.b)])).join(""), class: "wf" }),
    el("path", { d: (shape.lines ?? []).map(([a, b]) => seg([p(a), p(b)])).join(""), class: "wl" }),
  );
  return group;
}

const centroid = (face: Face): V3 => {
  const n = face.pts.length;
  return face.pts.reduce<V3>((acc, q) => [acc[0] + q[0] / n, acc[1] + q[1] / n, acc[2] + q[2] / n], [0, 0, 0]);
};

/** A small lit detail on a surface (an eye-slit), with the way that surface faces. */
export interface Decal {
  pts: V3[];
  n: V3;
}

/** The hero's material: flat faces lit from the upper left, a glowing edge on the outline only, lit details. */
export function solid(model: Model, f: Fit, lit: Decal[] = []): SVGElement {
  const front = model.faces.filter((x) => facing(x.n) > 0.01).sort((a, b) => depth(centroid(a)) - depth(centroid(b)));
  const flat = (x: Face) => pts(x.pts.map((q) => project(q, f)));
  const layer = (cls: string) => el("g", { class: cls }, ...front.map((x) => el("polygon", { points: flat(x) })));
  const faces = el(
    "g",
    {},
    ...front.map((x) => {
      if (x.part === "visor") return el("polygon", { points: flat(x), class: "s-lit" });
      const share = Math.round((0.18 + 0.82 * light(x.n)) * 100);
      const fill = `color-mix(in oklab, var(--solid-hi) ${share}%, var(--solid-lo))`;
      return el("polygon", { points: flat(x), fill, stroke: fill, "stroke-width": 0.6, "stroke-linejoin": "round" });
    }),
  );
  // lit details (the knight's eye) show only on the side that faces us
  const details = lit.filter((d) => facing(d.n) > 0.01).map((d) => el("polygon", { points: pts(d.pts.map((q) => project(q, f))), class: "s-lit" }));
  return el("g", { class: "s" }, layer("s-glow"), layer("s-hairline"), faces, ...details);
}

// -- broken wire -----------------------------------------------------------------------------------

export type Frame = "rest" | "break" | "snap";

/** A number in [0, 1) that is always the same for the same text. */
function hash(text: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

interface Damage {
  drop: number;
  register: number;
  jitter: number;
  slices: number;
  split: number;
}

const DAMAGE: Record<Frame, Damage> = {
  rest: { drop: 0.17, register: 0.3, jitter: 0, slices: 0, split: 1.3 },
  break: { drop: 0.26, register: 0.4, jitter: 1.5, slices: 5.5, split: 3 },
  snap: { drop: 0.2, register: 0.34, jitter: 0.35, slices: 1.2, split: 1.8 },
};

const SLICE = 7;
const SLIP = [1, -0.8, 1.2, -0.6, 0.9, -1.1, 0.7, -0.9, 1, -0.7];

/**
 * One frame of an enemy as broken wire. Damaged even at rest: two holes bitten out
 * of it, edges missing, lines out of register, colour-split ghosts. `lit`: quads lit
 * hot (an eye, a slit).
 */
export function broken(shape: Shape, f: Fit, frame: Frame, lit: V3[][] = []): SVGElement {
  const d = DAMAGE[frame];
  const all: Edge[] = [...edges(shape.model), ...(shape.lines ?? []).map(([a, b], i): Edge => ({ a, b, front: true, key: `line${i}:${a.join(",")}` }))];
  // the holes sit at fixed places on the piece's own bounds
  const screen = all.flatMap((e) => [project(e.a, f), project(e.b, f)]);
  const xs = screen.map((q) => q[0]);
  const ys = screen.map((q) => q[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const size = Math.min(x1 - x0, y1 - y0);
  const holes: Array<[number, number, number]> = [
    [x0 + (x1 - x0) * 0.78, y0 + (y1 - y0) * 0.6, size * 0.13],
    [x0 + (x1 - x0) * 0.25, y0 + (y1 - y0) * 0.14, size * 0.1],
  ];
  const inHole = (e: Edge) => {
    const [a, b] = [project(e.a, f), project(e.b, f)];
    const [mx, my] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    return holes.some(([hx, hy, r]) => Math.hypot(mx - hx, my - hy) < r);
  };
  // what is missing at rest stays missing in every frame; a break loses a few more
  const kept = all.filter((e) => !inHole(e) && hash(e.key, 1) >= DAMAGE.rest.drop && (frame === "rest" || hash(e.key, frame === "break" ? 2 : 3) >= d.drop - DAMAGE.rest.drop));
  const path = (list: Edge[], damage: Damage, dx = 0, salt = 0) => {
    const shake = (q: V3): Pt => {
      const [x, y] = project(q, f);
      if (!damage.jitter) return [x, y];
      const k = q.map((v) => v.toFixed(1)).join(",");
      return [x + (hash(k, 11 + salt) - 0.5) * 2 * damage.jitter, y + (hash(k, 23 + salt) - 0.5) * 2 * damage.jitter];
    };
    let front = "";
    let back = "";
    for (const e of list) {
      let [a, b] = [shake(e.a), shake(e.b)];
      let shift = dx;
      if (damage.slices) shift += (SLIP[Math.floor(((a[1] + b[1]) / 2 + 40) / SLICE) % SLIP.length] ?? 0) * damage.slices;
      if (hash(e.key, 5) < damage.register) shift += 1.3; // out of register
      a = [a[0] + shift, a[1]];
      b = [b[0] + shift, b[1]];
      if (e.front) front += seg([a, b]);
      else back += seg([a, b]);
    }
    return { front, back };
  };
  const main = path(kept, d);
  const visible = kept.filter((e) => e.front);
  const group = el(
    "g",
    { class: `bw bw-${frame}` },
    el("path", { d: path(visible, d, -d.split, 7).front, class: "bw-ghost-a" }),
    el("path", { d: path(visible, d, d.split, 9).front, class: "bw-ghost-b" }),
    el("path", { d: main.back, class: "bw-back" }),
    el("path", { d: main.front, class: "bw-front" }),
  );
  for (const quad of lit) group.append(el("polygon", { points: pts(quad.map((q) => project(q, f)).map(([x, y]) => [x + (frame === "break" ? 4 : 0), y])), class: "bw-lit" }));
  if (frame !== "rest") {
    const count = frame === "break" ? 9 : 3;
    for (let i = 0; i < count; i++) {
      group.append(el("rect", { x: (hash(`n${i}`, 31) - 0.5) * 56, y: (hash(`n${i}`, 37) - 0.5) * 56, width: 2 + hash(`n${i}`, 41) * 7, height: 1.1, class: i % 2 ? "bw-noise-a" : "bw-noise-b" }));
    }
  }
  if (frame === "snap") group.prepend(el("path", { d: path(visible, DAMAGE.break, 0, 3).front, class: "bw-after" }));
  return group;
}

/** An enemy as the board shows it: at rest, then now and then a break and a snap back (CSS times it). */
export function live(shape: Shape, f: Fit, lit: V3[][], delay: number): SVGElement {
  const group = el("g", { class: "bw-live", style: `--glitch-delay:${delay}s` });
  for (const frame of ["rest", "break", "snap"] as Frame[]) group.append(el("g", { class: `bf bf-${frame}` }, broken(shape, f, frame, lit)));
  return group;
}
