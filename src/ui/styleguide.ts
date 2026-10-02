// #/styleguide: the review page for the look (M3.7). Every tile, piece, enemy and skin at full
// size and at the 20px minimum, on both squares, in both themes side by side, on the real board
// with a button for each state, the enemies' break frames, and a greyscale switch.
// Like #/harness it is a page for the designer and for tests, not part of the game's flow.
import type { Facing } from "../py/protocol";
import { BoardView } from "./board";
import { h } from "./dom";
import { crown, enemy, goal, hero, tile, type EnemyKind, type Skin, type TileName } from "./sprites";
import { svg } from "./sprites/svg";
import { EVENTS, LEVEL, STATES, state } from "./styleguideSample";

const FACINGS: Facing[] = ["north", "east", "south", "west"];
const FOES: Array<[string, EnemyKind]> = [
  ["rook", "rook"],
  ["bishop", "bishop"],
  ["chaser / patrol", "chaser"],
];
const TILES: Array<[string, TileName]> = [
  ["wall", "wall"],
  ["sign", "sign"],
  ["rune", "rune"],
  ["guarded gate", "gate"],
  ["gate, open", "gateOpen"],
  ["timed gate", "gateTimed"],
  ["pit", "pit"],
  ["plank", "plank"],
  ["waypoint", "waypoint"],
  ["waypoint, crossed", "waypointDone"],
  ["gem", "gem"],
];

/** A sprite on a dark square and a light one, side by side, `px` tall. */
function cell(art: () => SVGElement, px: number): SVGElement {
  return svg(
    "svg",
    { viewBox: "0 0 128 64", width: px * 2, height: px, class: "sg-cell" },
    svg("rect", { x: 0, y: 0, width: 64, height: 64, class: "sq-dark" }),
    svg("rect", { x: 64, y: 0, width: 64, height: 64, class: "sq-light" }),
    svg("g", { transform: "translate(32 32)" }, art()),
    svg("g", { transform: "translate(96 32)" }, art()),
  );
}

/** A figure holding one sprite at 64px and again at 20px. */
const figure = (label: string, art: () => SVGElement) => h("figure", {}, cell(art, 64), cell(art, 20), h("figcaption", {}, label));

export function mountStyleguide(main: HTMLElement): () => void {
  let skin: Skin = "pawn";
  let facing: Facing = "east";
  const boards: BoardView[] = [];
  const level = () => ({ ...LEVEL, start: { ...LEVEL.start, facing } });

  const board = (small: boolean): HTMLElement => {
    const view = new BoardView(level(), { skin });
    boards.push(view);
    return h("div", { class: small ? "sg-board sg-board-min" : "sg-board" }, view.element);
  };

  const pane = (scheme: "dark" | "light"): HTMLElement =>
    h(
      "section",
      { class: "sg-pane", "data-scheme": scheme },
      h("h2", { class: "sg-name" }, scheme === "dark" ? "Night shift (dark)" : "Daylight terminal (light)"),
      h("h3", {}, "The board: every sprite, the threats"),
      h("div", { class: "sg-board-row" }, board(false), h("div", { class: "sg-board-side" }, h("p", {}, "The smallest main board: 20px squares. The halftone switches to bigger dots."), board(true))),
      h("h3", {}, "The hero, facing each way"),
      h("div", { class: "sg-sheet" }, ...FACINGS.map((face) => figure(`pawn, ${face}`, () => hero("pawn", face))), ...FACINGS.map((face) => figure(`knight, ${face}`, () => hero("knight", face)))),
      h("h3", {}, "Enemies at rest, mid-break and snapping back"),
      h("div", { class: "sg-sheet" }, ...FOES.flatMap(([label, kind]) => (["rest", "break", "snap"] as const).map((frame) => figure(`${label}, ${frame}`, () => enemy(kind, frame))))),
      h("h3", {}, "Tiles, the goal and the crowns"),
      h("div", { class: "sg-sheet" }, ...TILES.map(([label, name]) => figure(label, () => tile(name))), figure("goal", goal), figure("chapter cleared", () => crown(false)), figure("mastery too", () => crown(true))),
    );

  const button = (label: string, onClick: () => void) => h("button", { class: "btn btn-small", onClick }, label);
  const all = (fn: (view: BoardView) => void) => boards.forEach(fn);
  const skinButton = button("piece: pawn", () => {
    skin = skin === "pawn" ? "knight" : "pawn";
    skinButton.textContent = `piece: ${skin}`;
    all((view) => view.setSkin(skin));
  });
  const greyscale = button("greyscale", () => {
    const on = page.classList.toggle("sg-grey");
    greyscale.setAttribute("aria-pressed", String(on));
  });
  greyscale.setAttribute("aria-pressed", "false");

  const panes = h("div", { class: "sg-panes" }, pane("dark"), pane("light"));
  const page = h(
    "div",
    { class: "styleguide" },
    h("h1", {}, "Style guide"),
    h("p", { class: "muted" }, "The look at full size and at 20px, on both squares and in both themes. Each button drives the real board. The Animations setting applies."),
    h(
      "div",
      { class: "sg-controls" },
      h("div", {}, h("strong", {}, "State"), ...Object.keys(STATES).map((name) => button(name, () => all((view) => view.show({ ...state(name), facing }))))),
      h(
        "div",
        {},
        h("strong", {}, "Facing"),
        ...FACINGS.map((face) =>
          button(face, () => {
            facing = face;
            all((view) => view.show({ ...state("start"), facing }));
          }),
        ),
      ),
      h(
        "div",
        {},
        h("strong", {}, "Play"),
        button("bump", () => all((view) => view.animate(EVENTS.bump!, 700))),
        button("guard refuses", () => all((view) => view.animate(EVENTS.refuse!, 700))),
        button("read rune", () => all((view) => view.animate(EVENTS.read!, 700))),
        button("celebrate", () => all((view) => view.setCelebrating(!view.element.classList.contains("celebrate")))),
        skinButton,
        greyscale,
      ),
    ),
    panes,
  );
  main.replaceChildren(page);
  return () => boards.forEach((view) => view.dispose());
}
