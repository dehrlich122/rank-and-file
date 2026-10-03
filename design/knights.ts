// M3.7: the knight skin (the charger, without its tail), facing all four ways on a dark and a light square, in
// both themes. Dev-only: the game draws the same sprite.   /design/knights.html
import "../src/styles.css";
import "../src/chrome.css";
import "./knights.css";
import type { Facing } from "../src/py/protocol";
import { h } from "../src/ui/dom";
import { hero } from "../src/ui/sprites";
import { svg } from "../src/ui/svg";

const FACINGS: Facing[] = ["north", "east", "south", "west"];
const LABEL: Record<Facing, string> = { north: "from behind (north)", east: "east", south: "facing us (south)", west: "west" };

/** One knight on a dark square and a light one, side by side. */
function cell(face: Facing): SVGElement {
  return svg(
    "svg",
    { viewBox: "0 0 128 64", width: 320, height: 160, class: "sg-cell" },
    svg("rect", { x: 0, y: 0, width: 64, height: 64, class: "sq-dark" }),
    svg("rect", { x: 64, y: 0, width: 64, height: 64, class: "sq-light" }),
    svg("g", { transform: "translate(32 32)" }, hero("knight", face)),
    svg("g", { transform: "translate(96 32)" }, hero("knight", face)),
  );
}

const pane = (scheme: "dark" | "light") =>
  h(
    "section",
    { class: "sg-pane", "data-scheme": scheme },
    h("h2", { class: "sg-name" }, scheme === "dark" ? "Night shift" : "Daylight terminal"),
    h("div", { class: "knight-faces" }, ...FACINGS.map((face) => h("figure", {}, cell(face), h("figcaption", {}, LABEL[face])))),
  );

document.documentElement.dataset.motion = "reduced";
document.getElementById("app")!.append(h("div", { class: "styleguide" }, h("h1", {}, "Knight skin"), h("div", { class: "knight-panes" }, pane("dark"), pane("light"))));
