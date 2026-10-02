// M3.7 step 0, round 3 (design prototype): four directions side by side.
//   /design/directions.html
// Each is a 3x3 crop of the real lit-grid board (BoardView), dark theme only: the
// hero pawn, an enemy rook, a wall and one threatened square, plus the pawn alone
// at a large size. No animation this round. Dev-only, like the rest of design/.
import "@fontsource/orbitron/700.css";
import "../src/styles.css";
import "./directions.css";
import { h } from "../src/ui/dom";
import { cropBoard, largeSquare } from "./directions/crop";
import { LOOKS, type Look } from "./directions/looks";

const board = (look: Look) => cropBoard({ pawn: look.pawn(), rook: look.rook(), wall: look.wall(), hatch: look.hatch(`hatch-${look.id}`), hatchId: `hatch-${look.id}` });

const large = (look: Look) => largeSquare(look.pawn(), `${look.name}: the hero pawn, large`);

const page = document.getElementById("directions")!;
page.append(
  h(
    "header",
    { class: "dir-head" },
    h("h1", {}, "Round 3 · four directions"),
    h("p", {}, "Each is built differently. A 3×3 crop of the lit-grid board (hero pawn, enemy rook, wall, one threatened square), then the hero pawn alone, large. Dark theme, no animation."),
  ),
  h(
    "div",
    { class: "dir-grid" },
    ...LOOKS.map((look) =>
      h("section", { class: "dir", "data-dir": look.id }, h("h2", {}, h("span", { class: "dir-letter" }, look.id), look.name), h("p", { class: "dir-blurb" }, look.blurb), board(look), large(look)),
    ),
  ),
);
