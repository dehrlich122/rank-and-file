// M3.7 step 3 follow-up (design prototype): three redesigns of the knight skin, each facing all four ways,
// on a dark and a light square, in both themes. Dev-only: nothing here is in the game.
//   /design/knights.html
import "../src/styles.css";
import "../src/chrome.css";
import "./knights.css";
import type { Facing } from "../src/py/protocol";
import { h } from "../src/ui/dom";
import { knightHero } from "../src/ui/sprites";
import { knightEyes, knightModel } from "../src/ui/sprites/models";
import { svg } from "../src/ui/sprites/svg";
import { VARIANTS } from "./knights/variants";

const CURRENT = { name: "Current knight", blurb: "for comparison: a flat slab from the front and the back.", model: knightModel(), lit: knightEyes };
const FACINGS: Facing[] = ["north", "east", "south", "west"];
const LABEL: Record<Facing, string> = { north: "from behind (north)", east: "east", south: "facing us (south)", west: "west" };

/** One knight on a dark square and a light one, side by side. */
function cell(art: () => SVGElement): SVGElement {
  return svg(
    "svg",
    { viewBox: "0 0 128 64", width: 320, height: 160, class: "sg-cell" },
    svg("rect", { x: 0, y: 0, width: 64, height: 64, class: "sq-dark" }),
    svg("rect", { x: 64, y: 0, width: 64, height: 64, class: "sq-light" }),
    svg("g", { transform: "translate(32 32)" }, art()),
    svg("g", { transform: "translate(96 32)" }, art()),
  );
}

const pane = (scheme: "dark" | "light") =>
  h(
    "section",
    { class: "sg-pane", "data-scheme": scheme },
    h("h2", { class: "sg-name" }, scheme === "dark" ? "Night shift" : "Daylight terminal"),
    ...[() => CURRENT, ...VARIANTS].map((make, i) => {
      const variant = make();
      return h(
        "div",
        { class: "knight-row" },
        h("h3", {}, `${i} · ${variant.name}`, h("span", { class: "muted" }, ` ${variant.blurb}`)),
        h("div", { class: "knight-faces" }, ...FACINGS.map((face) => h("figure", {}, cell(() => knightHero(variant.model, variant.lit, face)), h("figcaption", {}, LABEL[face])))),
      );
    }),
  );

document.documentElement.dataset.motion = "reduced";
document.getElementById("app")!.append(
  h(
    "div",
    { class: "styleguide" },
    h("h1", {}, "Knight skin: three redesigns"),
    h("p", { class: "muted" }, "Each shown facing all four ways, on a dark and a light square. Row 0 is today's knight, for comparison."),
    h("div", { class: "knight-panes" }, pane("dark"), pane("light")),
  ),
);
