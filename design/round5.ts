// M3.7 step 0, round 5 (design prototype): small fixes to round 4.
//   /design/round5.html  (add ?still to hold every animation, for the screenshot)
// The hero becomes solid (flat faces, a glowing outline only), keeps round 4's
// HUD brackets and shows its facing through them; no light pool. The rook, the
// wall and the halftone square are round 4's. Plus one greyscale crop of the
// board at the 20px minimum, rasterised at that size so it is honest.
// Dev-only, like the rest of design/.
import "@fontsource/orbitron/700.css";
import "../src/styles.css";
import "./directions.css";
import "./round4.css";
import "./round5.css";
import type { Facing } from "../src/py/protocol";
import { h } from "../src/ui/dom";
import { cropBoard, largeSquare } from "./directions/crop";
import { el, LOOKS } from "./directions/looks";
import { liveRook } from "./round4/art";
import { hero } from "./round5/art";

if (new URLSearchParams(location.search).has("still")) document.documentElement.dataset.still = "";

const [WIRE, , POSTER] = LOOKS as [(typeof LOOKS)[number], unknown, (typeof LOOKS)[number]];

const board = (id: string, face: Facing) => cropBoard({ pawn: hero(face), rook: liveRook(), wall: WIRE.wall(), hatch: POSTER.hatch(id), hatchId: id, facing: face });

/** One facing, on a single dark square. */
function facingSquare(face: Facing): HTMLElement {
  return h(
    "figure",
    { class: "s5-facing" },
    el("svg", { viewBox: "-35 -35 70 70", role: "img", "aria-label": `facing ${face}` }, el("rect", { x: -32, y: -32, width: 64, height: 64, class: "sq-dark" }), el("rect", { x: -32, y: -32, width: 64, height: 64, class: "grid-edge" }), hero(face)) as unknown as Node,
    h("figcaption", {}, `facing ${face}`),
  );
}

// -- the 20px check: copy the board's computed styles inline, draw it into a canvas at 20px a square ----------

const STYLE_PROPS = ["fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity", "stroke-linejoin", "stroke-linecap", "opacity", "filter", "display", "visibility", "font-family", "font-size", "font-weight", "stop-color", "stop-opacity", "transform"];

function inlined(svg: SVGSVGElement): string {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  const from = [svg, ...svg.querySelectorAll("*")];
  const to = [copy, ...copy.querySelectorAll("*")];
  from.forEach((source, i) => {
    const style = getComputedStyle(source);
    const target = to[i] as SVGElement;
    target.setAttribute("style", STYLE_PROPS.map((p) => `${p}:${style.getPropertyValue(p)}`).join(";"));
  });
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return new XMLSerializer().serializeToString(copy);
}

async function minimum(): Promise<HTMLElement> {
  const host = h("div", { class: "s5-offscreen" }, board("halftone-min", "east"));
  document.body.append(host);
  const svg = host.querySelector<SVGSVGElement>("svg.board")!;
  const [w, hgt] = svg.getAttribute("viewBox")!.split(" ").slice(2).map(Number) as [number, number];
  const scale = 20 / 64; // 20px a square
  const [cw, ch] = [Math.round(w * scale), Math.round(hgt * scale)];
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(inlined(svg))}`;
  await image.decode();
  host.remove();
  const canvas = (zoom: number) => {
    const c = h("canvas", { width: cw, height: ch, class: "s5-min", style: `width:${cw * zoom}px;height:${ch * zoom}px` });
    c.getContext("2d")!.drawImage(image, 0, 0, cw, ch);
    return c;
  };
  return h(
    "div",
    { class: "s5-min-row" },
    h("figure", {}, canvas(1), h("figcaption", {}, "actual size")),
    h("figure", {}, canvas(4), h("figcaption", {}, "the same pixels, 4×")),
  );
}

const page = document.getElementById("round5")!;
const minSlot = h("div", {});
page.append(
  h(
    "header",
    { class: "dir-head" },
    h("h1", {}, "Round 5 · a solid hero in a wire world"),
    h("p", {}, "The hero is solid: flat faces lit from the upper left, no lines inside them, a glowing edge along its outline only, and the only floor shadow. HUD brackets frame its square, and show its facing: the side it faces is brighter and carries a notch."),
  ),
  h(
    "div",
    { class: "s5-grid" },
    h("section", { class: "dir" }, h("h2", {}, "On the board · facing east"), board("halftone-main", "east"), largeSquare(hero("east"), "The hero, large, facing east", "r4-large")),
    h("section", { class: "dir" }, h("h2", {}, "Its four facings"), h("p", { class: "dir-blurb" }, "The two bracket corners on the facing side light up, and a notch points out of that side. The model turns to face that way too; facing north, its visor is turned away."), h("div", { class: "s5-facings" }, ...(["north", "east", "south", "west"] as Facing[]).map(facingSquare))),
    h("section", { class: "dir" }, h("h2", {}, "Greyscale · 20px squares"), h("p", { class: "dir-blurb" }, "The 3×3 board drawn at the smallest size we ship, 20px a square, then turned grey. Left at actual size; right, the same pixels enlarged."), minSlot),
  ),
);
minimum().then((row) => {
  minSlot.replaceWith(row);
  document.documentElement.dataset.ready = "";
});
