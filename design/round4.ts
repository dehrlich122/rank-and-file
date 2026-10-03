// M3.7 step 0, round 4 (design prototype): a wireframe world, a solid hero.
//   /design/round4.html  (add ?still to hold every animation, for the screenshot)
// Three hero variants side by side, each on the 3x3 lit-grid crop and alone at a
// large size, then the enemy rook's glitch-and-break in three frames.
// Dev-only, like the rest of design/.
import "@fontsource/orbitron/700.css";
import "../src/styles.css";
import "./directions.css";
import "./round4.css";
import type { Facing } from "../src/py/protocol";
import { h } from "../src/ui/dom";
import { cropBoard, largeSquare } from "./directions/crop";
import { el, LOOKS } from "./directions/looks";
import { brokenRook, hero, liveRook, type Frame, type Variant } from "./round4/art";

if (new URLSearchParams(location.search).has("still")) document.documentElement.dataset.still = "";

// The decided world: A's clean violet wireframe wall, C's halftone dots on threatened squares.
const [WIRE, , POSTER] = LOOKS as [(typeof LOOKS)[number], unknown, (typeof LOOKS)[number]];

interface Option {
  n: Variant;
  name: string;
  blurb: string;
  facing?: Facing;
}

const OPTIONS: Option[] = [
  { n: 1, name: "Light pool", blurb: "Solid faces with glowing wire edges, standing in a soft cyan light pooled on its square." },
  {
    n: 2,
    name: "Cursor",
    blurb: "The same, plus a blinking >_ beside the helm. Its chevron points the way the pawn faces, so it is also the facing pointer, and the model turns that way too. Here it faces east.",
    facing: "east",
  },
  {
    n: 3,
    name: "Program cursor",
    blurb: "My pick: HUD brackets frame the hero's own square, like a text cursor or a selected unit, and a rim light cuts its shaded side out of the board. The brackets are a shape, so they survive greyscale and the smallest board.",
  },
];

const board = (o: Option) => {
  const id = `halftone-${o.n}`;
  return cropBoard({ pawn: hero(o.n, o.facing), rook: liveRook(), wall: WIRE.wall(), hatch: POSTER.hatch(id), hatchId: id, facing: o.facing });
};

/** The cursor's four facings, small: the chevron and the model both turn. */
function facings(): HTMLElement {
  const order: Facing[] = ["north", "east", "south", "west"];
  return h(
    "div",
    { class: "r4-facings" },
    ...order.map((face) =>
      h(
        "figure",
        {},
        el("svg", { viewBox: "-33 -33 66 66", class: "r4-mini", role: "img", "aria-label": `facing ${face}` }, el("rect", { x: -32, y: -32, width: 64, height: 64, class: "sq-dark" }), el("rect", { x: -32, y: -32, width: 64, height: 64, class: "grid-edge" }), hero(2, face)) as unknown as Node,
        h("figcaption", {}, face),
      ),
    ),
  );
}

const FRAMES: Array<{ frame: Frame; caption: string }> = [
  { frame: "rest", caption: "Rest: missing segments, lines out of register. Also the whole look with reduced motion." },
  { frame: "break", caption: "Mid-break: the mesh tears into slices that slip sideways, its vertices jitter, its colours split." },
  { frame: "snap", caption: "Snapping back: the slices realign, an afterimage of the break fades." },
];

const page = document.getElementById("round4")!;
page.append(
  h(
    "header",
    { class: "dir-head" },
    h("h1", {}, "Round 4 · a wireframe world, a solid hero"),
    h("p", {}, "The world is wireframe; the hero is the only solid thing in it, and the only thing with a floor shadow. Enemies are broken wireframe, threatened squares are halftone dots, walls are clean violet wire."),
  ),
  h(
    "div",
    { class: "r4-grid" },
    ...OPTIONS.map((o) =>
      h(
        "section",
        { class: "dir r4-col" },
        h("h2", {}, h("span", { class: "dir-letter" }, String(o.n)), o.name),
        h("p", { class: "dir-blurb r4-blurb" }, o.blurb),
        board(o),
        largeSquare(hero(o.n, o.facing), `Hero variant ${o.n}, large`, "r4-large"),
        o.n === 2 ? facings() : null,
      ),
    ),
  ),
  h(
    "section",
    { class: "dir r4-rook-row" },
    h("h2", {}, h("span", { class: "dir-letter" }, "✕"), "Enemy rook: glitch and break"),
    h("p", { class: "dir-blurb" }, "On the boards above it rests for about five seconds, then breaks and snaps back in under half a second. These are its three frames."),
    h(
      "div",
      { class: "r4-frames" },
      ...FRAMES.map(({ frame, caption }) => h("figure", {}, largeSquare(brokenRook(frame), `Enemy rook, ${frame}`, "r4-frame"), h("figcaption", {}, caption))),
    ),
  ),
);
