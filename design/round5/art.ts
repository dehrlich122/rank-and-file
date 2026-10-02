// M3.7 step 0, round 5 (design prototype, never shipped): the hero as a different material.
//
// The world is wire; the hero is solid: chunky flat-shaded faces lit from the
// upper left, no lines inside them, and one glowing edge along its outline. HUD
// brackets frame its square (the hero only), and the bracket side it faces is
// brighter and carries a notch, so the facing reads without a floating glyph.
import type { Facing } from "../../src/py/protocol";
import { el } from "../directions/looks";
import { depth, facing, fit, floor, light, pawnModel, project, pts, yaw, type Face, type Fit, type Pt, type V3 } from "../directions/mesh";

const centroid = (face: Face): V3 => {
  const n = face.pts.length;
  return face.pts.reduce<V3>((acc, p) => [acc[0] + p[0] / n, acc[1] + p[1] / n, acc[2] + p[2] / n], [0, 0, 0]);
};

const flat = (face: Face, f: Fit): Pt[] => face.pts.map((p) => project(p, f));

// The low-poly pawn's visor points here after pawnModel's own turn (8 facets, see mesh.ts);
// each facing turns it: east and west to the side (a little toward us), south at us, north away.
const VISOR = Math.PI / 2 + Math.PI / 8 + 0.25;
const FACING_ANGLE: Record<Facing, number> = { east: 0.35, west: Math.PI - 0.35, south: Math.PI / 2, north: -Math.PI / 2 };

/** The solid pawn, centred on its square, with its floor shadow. It leaves a margin top and bottom for the brackets' notch. */
function solidPawn(face: Facing): SVGElement {
  const model = yaw(pawnModel("low"), FACING_ANGLE[face] - VISOR);
  const f = fit(model, 52, 55, 27.5);
  const front = model.faces.filter((x) => facing(x.n) > 0.01).sort((a, b) => depth(centroid(a)) - depth(centroid(b)));
  const shape = (cls: string) => el("g", { class: cls }, ...front.map((x) => el("polygon", { points: pts(flat(x, f)) })));
  const { c, rx, ry } = floor(f, 20);
  return el(
    "g",
    { class: "s5-pawn" },
    // the only floor shadow on the board
    el("ellipse", { cx: c[0] + rx * 0.2, cy: c[1] + ry * 0.35, rx: rx * 1.1, ry: ry * 1.25, class: "s5-shadow" }),
    // the glowing edge, then a dark hairline inside it: the faces cover everything but the outline
    shape("s5-glow"),
    shape("s5-hairline"),
    el(
      "g",
      {},
      ...front.map((x) => {
        if (x.part === "visor") return el("polygon", { points: pts(flat(x, f)), class: "s5-visor" });
        const lit = Math.round((0.18 + 0.82 * light(x.n)) * 100);
        const fill = `color-mix(in oklab, var(--s5-hi) ${lit}%, var(--s5-lo))`;
        // each face stroked in its own colour, so no seam shows between faces
        return el("polygon", { points: pts(flat(x, f)), fill, stroke: fill, "stroke-width": 0.6, "stroke-linejoin": "round" });
      }),
    ),
  );
}

const A = 29.5; // the brackets' distance from the square's centre
const ARM = 11;

/** The HUD brackets on the hero's square. The two corners on the side it faces are bright, and a notch points out of that side. */
function brackets(face: Facing): SVGElement {
  // corners as [x sign, y sign]; each is on two sides
  const corners: Array<[number, number]> = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  const onSide = ([sx, sy]: [number, number]) => (face === "north" ? sy < 0 : face === "south" ? sy > 0 : face === "east" ? sx > 0 : sx < 0);
  const path = (list: Array<[number, number]>) => list.map(([sx, sy]) => `M ${sx * A} ${sy * (A - ARM)} V ${sy * A} H ${sx * (A - ARM)}`).join(" ");
  const turn = { north: 0, east: 90, south: 180, west: 270 }[face];
  return el(
    "g",
    { class: "s5-brackets" },
    el("path", { d: path(corners.filter((c) => !onSide(c))), class: "s5-bracket" }),
    el("path", { d: path(corners.filter(onSide)), class: "s5-bracket s5-bracket-facing" }),
    // the notch: a small caret on the facing side's midpoint, pointing out
    el("path", { d: `M -4 ${-A + 1.2} L 0 ${-A - 2.2} L 4 ${-A + 1.2} Z`, class: "s5-notch", transform: `rotate(${turn})` }),
  );
}

/** The hero on its square: brackets, shadow, solid body. */
export function hero(face: Facing): SVGElement {
  return el("g", { class: "s5-hero" }, brackets(face), solidPawn(face));
}
