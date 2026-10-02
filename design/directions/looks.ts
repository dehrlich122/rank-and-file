// M3.7 step 0, round 3 (design prototype, never shipped): four ways to build a piece.
//
//   A  Wireframe     glowing line art, no fills: a 3/4-view wire mesh
//   B  Low-poly      flat-shaded solid faces with real form and one strong light
//   C  Neon poster   bold flat shapes, thick ink outlines, cel shading, halftone, a print shadow
//   D  Hologram      pieces made of light: translucent, scanlined, data glyphs, a chromatic fringe
//
// Every piece is drawn centred on (0, 0) in its 64-unit square and stays inside it.
// Colours are CSS custom properties only (design/directions.css).
import { depth, facing, fit, floor, light, pawnModel, project, pts, rookModel, rookSlit, wallModel, type Face, type Fit, type Model, type Pt, type V3 } from "./mesh";

const NS = "http://www.w3.org/2000/svg";

export function el(tag: string, attrs: Record<string, string | number> = {}, ...kids: Array<Element | string>): SVGElement {
  const node = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  for (const kid of kids) node.append(kid);
  return node as SVGElement;
}

let ids = 0;
const uid = (prefix: string) => `${prefix}-${++ids}`;

export interface Look {
  id: "A" | "B" | "C" | "D";
  name: string;
  blurb: string;
  pawn(): SVGElement;
  rook(): SVGElement;
  wall(): SVGElement;
  /** The threatened square's pattern, kept quiet. */
  hatch(id: string): SVGElement;
}

const centroid = (face: Face): V3 => {
  const n = face.pts.length;
  return face.pts.reduce<V3>((acc, p) => [acc[0] + p[0] / n, acc[1] + p[1] / n, acc[2] + p[2] / n], [0, 0, 0]);
};

const byDepth = (faces: Face[]) => [...faces].sort((a, b) => depth(centroid(a)) - depth(centroid(b)));
const frontOf = (model: Model) => model.faces.filter((f) => facing(f.n) > 0.01);
const backOf = (model: Model) => model.faces.filter((f) => facing(f.n) <= 0.01);

/** A face as screen points, shifted sideways by `dx` (the glitch's slice). */
const flat = (face: Face, f: Fit, dx = 0): Pt[] => face.pts.map((p) => {
  const [x, y] = project(p, f);
  return [x + dx, y];
});

/** Whether a face lies in the rook's corrupted band (a slice that slipped sideways). */
const inBand = (face: Face, [lo, hi]: [number, number]) => {
  const y = centroid(face)[1];
  return y >= lo && y <= hi;
};

const BAND: [number, number] = [19, 25];

/** The screen-space bounds of some faces. */
function bounds(faces: Face[], f: Fit): { x: number; y: number; w: number; h: number } {
  const all = faces.flatMap((face) => flat(face, f));
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const [x, y] = [Math.min(...xs), Math.min(...ys)];
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

const hatchPattern = (id: string, spacing: number, ...kids: SVGElement[]) =>
  el("pattern", { id, patternUnits: "userSpaceOnUse", width: spacing, height: spacing, patternTransform: "rotate(45)" }, ...kids);

// -- A: wireframe ---------------------------------------------------------------------------------

function wireframe(model: Model, f: Fit, role: string, options: { glitch?: boolean } = {}): SVGElement {
  const group = el("g", { class: `wire wire-${role}` });
  const poly = (face: Face, cls: string, dx = 0) => el("polygon", { points: pts(flat(face, f, dx)), class: cls });
  if (options.glitch) {
    // a ghost of the whole mesh, out of register: the signal is breaking up
    const ghost = el("g", { class: "w-ghost" });
    for (const face of frontOf(model)) ghost.append(poly(face, "w-ghost-line", -2.2));
    group.append(ghost);
  }
  for (const face of backOf(model)) group.append(poly(face, "w-back"));
  for (const face of frontOf(model)) {
    const dx = options.glitch && inBand(face, BAND) ? 3 : 0;
    group.append(poly(face, face.part === "visor" ? "w-visor" : "w-front", dx));
  }
  for (const line of model.contour) group.append(el("polyline", { points: pts(line.map((p) => project(p, f))), class: "w-contour" }));
  return group;
}

const wireBase = (f: Fit, radius: number, role: string) => {
  const { c, rx, ry } = floor(f, radius);
  return el("g", { class: `wire wire-${role}` }, el("ellipse", { cx: c[0], cy: c[1], rx, ry, class: "w-pad" }), el("ellipse", { cx: c[0], cy: c[1], rx: rx * 0.72, ry: ry * 0.72, class: "w-back" }));
};

/** Brick courses on a wall's front face (z = 26), as lines. */
function brickLines(f: Fit): Array<[Pt, Pt]> {
  const z = 26;
  const p = (x: number, y: number) => project([x, y, z], f);
  const rows = [0, 6.3, 12.6, 19];
  const joints = [[-8, 10], [-17, 1, 19], [-8, 10]];
  const lines: Array<[Pt, Pt]> = rows.slice(1, -1).map((y) => [p(-26, y), p(26, y)]);
  joints.forEach((xs, i) => xs.forEach((x) => lines.push([p(x, rows[i]!), p(x, rows[i + 1]!)])));
  return lines;
}

const A: Look = {
  id: "A",
  name: "Wireframe",
  blurb: "Glowing line art, no fills: each piece a 3/4-view wire mesh, after Tron and Battlezone.",
  pawn() {
    const model = pawnModel("mid");
    const f = fit(model);
    return el("g", {}, wireBase(f, 21, "hero"), wireframe(model, f, "hero"));
  },
  rook() {
    const model = rookModel("mid");
    const f = fit(model, 52, 56);
    const slit = el("polygon", { points: pts(rookSlit().map((p) => project(p, f))), class: "w-slit" });
    return el("g", {}, wireBase(f, 22, "foe"), wireframe(model, f, "foe", { glitch: true }), el("g", { class: "wire wire-hot" }, slit));
  },
  wall() {
    const model = wallModel();
    const f = fit(model, 56, 50, 27);
    const group = el("g", { class: "wire wire-wall" });
    for (const face of frontOf(model)) group.append(el("polygon", { points: pts(flat(face, f)), class: "w-front" }));
    for (const [a, b] of brickLines(f)) group.append(el("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: "w-back" }));
    return group;
  },
  hatch: (id) => hatchPattern(id, 10, el("rect", { width: 0.9, height: 10, class: "hatch-line" })),
};

// -- B: low-poly solid ---------------------------------------------------------------------------------

function solid(model: Model, f: Fit, role: string, options: { glitch?: boolean } = {}): SVGElement {
  const faces = byDepth(frontOf(model));
  const group = el("g", { class: `solid solid-${role}` });
  // a dark outline under everything, so the piece stands off the board
  for (const face of faces) group.append(el("polygon", { points: pts(flat(face, f)), class: "s-outline" }));
  for (const face of faces) {
    const lit = Math.round((0.16 + 0.84 * light(face.n)) * 100);
    const fill = face.part === "visor" ? "var(--b-visor)" : `color-mix(in oklab, var(--b-${role}-hi) ${lit}%, var(--b-${role}-lo))`;
    if (options.glitch && inBand(face, BAND)) {
      group.append(el("polygon", { points: pts(flat(face, f, -1.6)), fill: "var(--glitch-b)", stroke: "var(--glitch-b)", "stroke-width": 0.4 }));
      group.append(el("polygon", { points: pts(flat(face, f, 2.4)), fill, stroke: fill, "stroke-width": 0.4 }));
    } else {
      group.append(el("polygon", { points: pts(flat(face, f)), fill, stroke: fill, "stroke-width": 0.4 }));
    }
  }
  return group;
}

const castShadow = (f: Fit, radius: number) => {
  const { c, rx, ry } = floor(f, radius);
  // the light is up and to the left, so the shadow falls down and to the right
  return el("ellipse", { cx: c[0] + rx * 0.22, cy: c[1] + ry * 0.35, rx: rx * 1.12, ry: ry * 1.25, class: "b-shadow" });
};

const B: Look = {
  id: "B",
  name: "Low-poly solid",
  blurb: "Chunky flat-shaded polygons with real 3D form and one strong light from the upper left, after The Lawnmower Man's VR world.",
  pawn() {
    const model = pawnModel("low");
    const f = fit(model);
    return el("g", {}, castShadow(f, 20), solid(model, f, "hero"));
  },
  rook() {
    const model = rookModel("low");
    const f = fit(model, 52, 56);
    const slit = el("polygon", { points: pts(rookSlit().map((p) => project(p, f))), class: "b-slit" });
    const dead = [[-6, 8], [7, 2]].map(([x, y]) => el("rect", { x: x!, y: y!, width: 2.2, height: 2.2, class: "b-dead" }));
    return el("g", {}, castShadow(f, 21), solid(model, f, "foe", { glitch: true }), slit, ...dead);
  },
  wall() {
    const model = wallModel();
    const f = fit(model, 56, 50, 27);
    const group = el("g", {}, el("rect", { x: -27, y: 22, width: 56, height: 8, class: "b-shadow" }), solid(model, f, "wall"));
    for (const [a, b] of brickLines(f)) group.append(el("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: "b-seam" }));
    return group;
  },
  hatch: (id) => hatchPattern(id, 10, el("rect", { width: 10, height: 10, class: "hatch-base" }), el("rect", { width: 1.4, height: 10, class: "hatch-line" })),
};

// -- C: neon poster -----------------------------------------------------------------------------------

interface Poster {
  silhouette: string; // the main shape's path
  extra?: string; // a shape drawn behind it (the pawn's crest)
  kx: number;
  ky: number;
  bottom: number;
}

/** A profile drawn flat and front-on: up the left side, down the right. */
function profilePath(profile: Array<[number, number]>, kx: number, ky: number, bottom: number): string {
  const left = profile.map(([h, r]) => `${(-r * kx).toFixed(2)},${(bottom - h * ky).toFixed(2)}`);
  const right = [...profile].reverse().map(([h, r]) => `${(r * kx).toFixed(2)},${(bottom - h * ky).toFixed(2)}`);
  return `M ${[...left, ...right].join(" L ")} Z`;
}

const POSTER_PAWN: Array<[number, number]> = [[0, 19], [3.5, 19], [6, 16], [9, 13], [17, 10], [24, 8.4], [25.5, 12.6], [28.5, 12.6], [30.5, 7.7], [33.5, 7.9], [36, 9.7], [38.5, 10.9], [41, 11.5], [46, 11.4], [49, 10.4], [51.5, 8.6], [53.5, 6], [55, 3.1], [55.7, 0]];

function posterPawn(): Poster {
  const [kx, ky, bottom] = [1.22, 0.95, 26.5];
  const crest = `M ${-1.8 * kx} ${bottom - 51 * ky} L ${-1.8 * kx} ${bottom - 60.5 * ky} L ${6 * kx} ${bottom - 58 * ky} L ${6.5 * kx} ${bottom - 52 * ky} Z`;
  return { silhouette: profilePath(POSTER_PAWN, kx, ky, bottom), extra: crest, kx, ky, bottom };
}

function posterRook(): Poster {
  const [kx, ky, bottom] = [1.2, 1.06, 26.5];
  const up: Array<[number, number]> = [[-20.5, 0], [-20.5, 4], [-16.8, 7], [-13.6, 10], [-12.3, 33], [-15.8, 35], [-15.8, 48], [-9.4, 48], [-9.4, 43], [-3.2, 43], [-3.2, 48], [3.2, 48], [3.2, 43], [9.4, 43], [9.4, 48], [15.8, 48], [15.8, 35], [12.3, 33], [13.6, 10], [16.8, 7], [20.5, 4], [20.5, 0]];
  const d = `M ${up.map(([x, h]) => `${(x * kx).toFixed(2)},${(bottom - h * ky).toFixed(2)}`).join(" L ")} Z`;
  return { silhouette: d, kx, ky, bottom };
}

/** A poster piece: print shadow, flat fill, cel shade with halftone, highlights, thick ink outline. */
function poster(shape: Poster, role: "hero" | "foe", details: (p: Poster) => SVGElement[]): SVGElement {
  const clip = uid("clip");
  const dots = uid("dots");
  const group = el(
    "g",
    { class: `poster poster-${role}` },
    el(
      "defs",
      {},
      el("clipPath", { id: clip }, el("path", { d: shape.silhouette })),
      el("pattern", { id: dots, patternUnits: "userSpaceOnUse", width: 2.6, height: 2.6, patternTransform: "rotate(45)" }, el("circle", { cx: 1.3, cy: 1.3, r: 0.72, class: "p-dot" })),
    ),
  );
  const shapes = [shape.extra, shape.silhouette].filter(Boolean) as string[];
  for (const d of shapes) group.append(el("path", { d, class: "p-print", transform: "translate(3.4 2.8)" }));
  if (shape.extra) group.append(el("path", { d: shape.extra, class: "p-fill p-ink" }));
  group.append(el("path", { d: shape.silhouette, class: "p-fill" }));
  group.append(
    el(
      "g",
      { "clip-path": `url(#${clip})` },
      // the shaded side, cut hard (cel shading), with halftone dots in it
      el("path", { d: "M 3 -40 Q 6 0 1.5 40 L 40 40 L 40 -40 Z", class: "p-shade" }),
      el("path", { d: "M 3 -40 Q 6 0 1.5 40 L 40 40 L 40 -40 Z", fill: `url(#${dots})` }),
      ...details(shape),
    ),
  );
  group.append(el("path", { d: shape.silhouette, class: "p-ink-line" }));
  return group;
}

const C: Look = {
  id: "C",
  name: "Neon poster",
  blurb: "Bold flat shapes, thick ink outlines, hard cel shading and a halftone, with a hard print shadow, after Hotline Miami's title cards.",
  pawn() {
    return poster(posterPawn(), "hero", ({ kx, ky, bottom }) => {
      const y = (h: number) => bottom - h * ky;
      return [
        el("rect", { x: -8.6 * kx, y: y(56), width: 2.3 * kx, height: 56 * ky, class: "p-hi" }), // a highlight stripe
        el("rect", { x: -20, y: y(46), width: 40, height: 5 * ky, class: "p-visor" }),
        el("rect", { x: -9 * kx, y: y(44.6), width: 10 * kx, height: 1.8 * ky, class: "p-visor-lit" }),
        el("circle", { cx: -5.5 * kx, cy: y(50.5), r: 1.6, class: "p-glint" }),
      ];
    });
  },
  rook() {
    const shape = posterRook();
    const y = (h: number) => shape.bottom - h * shape.ky;
    const art = (shift: number) =>
      poster(shape, "foe", ({ kx }) => [
        el("rect", { x: -9.6 * kx, y: y(43), width: 2.2 * kx, height: 43 * shape.ky, class: "p-hi" }),
        el("rect", { x: -1.7 * kx, y: y(28), width: 3.4 * kx, height: 11 * shape.ky, class: "p-slit" }),
        el("polyline", { points: `${-6 * kx},${y(31)} ${-3 * kx},${y(26)} ${-6.5 * kx},${y(22)} ${-3.5 * kx},${y(16)}`, class: "p-crack" }),
        el("rect", { x: 5 * kx + shift, y: y(13), width: 2.4, height: 2.4, class: "p-dead" }),
      ]);
    // a torn strip, printed out of register: the corruption
    const band = uid("band");
    return el(
      "g",
      {},
      art(0),
      el("defs", {}, el("clipPath", { id: band }, el("rect", { x: -40, y: y(25), width: 80, height: 5 * shape.ky }))),
      el("g", { "clip-path": `url(#${band})` }, el("g", { transform: "translate(3.6 0)" }, art(0))),
      el("line", { x1: -16 * shape.kx, y1: y(25), x2: 16 * shape.kx + 3.6, y2: y(25), class: "p-tear" }),
    );
  },
  wall() {
    const clip = uid("clip");
    const dots = uid("dots");
    const front = "M -27 27 L -27 6 L 27 6 L 27 27 Z";
    const top = "M -27 6 L -22 -6 L 22 -6 L 27 6 Z";
    const all = "M -27 27 L -27 6 L -22 -6 L 22 -6 L 27 6 L 27 27 Z";
    const seams = ["M -27 13 H 27", "M -27 20 H 27", "M -9 6 V 13", "M 10 6 V 13", "M -18 13 V 20", "M 1 13 V 20", "M 19 13 V 20", "M -9 20 V 27", "M 10 20 V 27"];
    return el(
      "g",
      { class: "poster poster-wall" },
      el(
        "defs",
        {},
        el("clipPath", { id: clip }, el("path", { d: front })),
        el("pattern", { id: dots, patternUnits: "userSpaceOnUse", width: 2.6, height: 2.6, patternTransform: "rotate(45)" }, el("circle", { cx: 1.3, cy: 1.3, r: 0.72, class: "p-dot" })),
      ),
      el("path", { d: all, class: "p-print", transform: "translate(2.6 2.2)" }),
      el("path", { d: front, class: "p-fill" }),
      el("path", { d: top, class: "p-top" }),
      el("g", { "clip-path": `url(#${clip})` }, el("rect", { x: -27, y: 15, width: 54, height: 12, fill: `url(#${dots})` })),
      ...seams.map((d) => el("path", { d, class: "p-seam" })),
      el("path", { d: all, class: "p-ink-line" }),
      el("path", { d: "M -27 6 H 27", class: "p-ink-line" }),
    );
  },
  hatch: (id) => hatchPattern(id, 5, el("circle", { cx: 2.5, cy: 2.5, r: 0.8, class: "hatch-dot" })),
};

// -- D: hologram -------------------------------------------------------------------------------------

/** Rows of data glyphs, the same every time. */
function glyphRows(count: number, width: number, seed: number): string[] {
  let s = seed;
  const next = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  const chars = "01011001ABCDEF";
  return Array.from({ length: count }, () => Array.from({ length: width }, () => chars[Math.floor(next() * chars.length)]).join(""));
}

function hologram(model: Model, f: Fit, role: string, options: { glitch?: boolean; seed?: number; base?: number } = {}): SVGElement {
  const front = byDepth(frontOf(model));
  const clip = uid("holo");
  const scan = uid("scan");
  const box = bounds(model.faces, f);
  const group = el(
    "g",
    { class: `holo holo-${role}` },
    el(
      "defs",
      {},
      el("clipPath", { id: clip }, ...front.map((face) => el("polygon", { points: pts(flat(face, f)) }))),
      el("pattern", { id: scan, patternUnits: "userSpaceOnUse", width: 4, height: 2.2 }, el("rect", { width: 4, height: 0.75, class: "h-scanline" })),
    ),
  );
  if (options.base) {
    // the projector it stands on: a lit disc on the floor
    const { c, rx, ry } = floor(f, options.base);
    group.append(el("ellipse", { cx: c[0], cy: c[1], rx, ry, class: "h-pad" }), el("ellipse", { cx: c[0], cy: c[1], rx: rx * 1.08, ry: ry * 1.08, class: "h-pad-ring" }));
  }
  for (const face of backOf(model)) group.append(el("polygon", { points: pts(flat(face, f)), class: "h-back" }));
  for (const face of front) {
    const dx = options.glitch && inBand(face, BAND) ? 2.6 : 0;
    // brighter where the surface turns away: light gathers at the edges of a hologram
    const edge = 1 - facing(face.n);
    group.append(el("polygon", { points: pts(flat(face, f, dx)), class: face.part === "visor" ? "h-visor" : "h-face", "fill-opacity": ((role === "hero" ? 0.24 : 0.14) + 0.42 * edge).toFixed(2) }));
  }
  const rows = glyphRows(Math.ceil(box.h / 4.2), Math.ceil(box.w / 2.4), options.seed ?? 7);
  group.append(
    el(
      "g",
      { "clip-path": `url(#${clip})` },
      el("rect", { x: box.x, y: box.y, width: box.w, height: box.h, fill: `url(#${scan})` }),
      ...rows.map((row, i) => el("text", { x: box.x + 0.5, y: box.y + 3.6 + i * 4.2, class: "h-glyphs" }, row)),
    ),
  );
  const outline = (cls: string, dx: number) => model.contour.map((line) => el("polyline", { points: pts(line.map((p) => project(p, f)).map(([x, y]) => [x + dx, y])), class: cls }));
  group.append(...outline("h-fringe-a", -0.9), ...outline("h-fringe-b", 0.9), ...outline("h-contour", 0));
  return group;
}

const D: Look = {
  id: "D",
  name: "Hologram",
  blurb: "Pieces made of light: translucent, scanlined, data glyphs inside and a slight chromatic fringe, after the inside-the-computer scenes in Hackers.",
  pawn() {
    const model = pawnModel("high");
    return hologram(model, fit(model), "hero", { seed: 11, base: 21 });
  },
  rook() {
    const model = rookModel("high");
    const f = fit(model, 52, 56);
    const slit = el("polygon", { points: pts(rookSlit().map((p) => project(p, f))), class: "h-slit" });
    return el("g", {}, hologram(model, f, "foe", { glitch: true, seed: 29, base: 22 }), slit);
  },
  wall() {
    const model = wallModel();
    const f = fit(model, 56, 50, 27);
    const group = hologram(model, f, "wall", { seed: 3 });
    for (const face of frontOf(model)) group.append(el("polygon", { points: pts(flat(face, f)), class: "h-edge" }));
    return group;
  },
  hatch: (id) => hatchPattern(id, 7, el("rect", { width: 0.7, height: 7, class: "hatch-line" })),
};

export const LOOKS: Look[] = [A, B, C, D];
