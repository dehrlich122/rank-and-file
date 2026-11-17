// M5.1 (design sheet): the knight as the piece, before any of it goes into the game.
//   /design/knight-piece.html
// Five panes, each in both themes: the knight as the hero (and three takes on facing north), the jump (two takes
// and a reduced-motion version, played live), the trail, the landing squares (three marks, two versions), and the
// Settings → Piece and Skins mock-ups with an "Auto" choice. It draws with the game's real sprites and classes.
// Dev-only; nothing here is in the game. The only new colours are tokens in knight-piece.css.
import "@fontsource/orbitron/500.css";
import "@fontsource/orbitron/700.css";
import "@fontsource/orbitron/900.css";
import "../src/styles.css";
import "../src/chrome.css";
import "../src/free.css";
import "./knight-piece.css";
import type { Facing, Pos } from "../src/py/protocol";
import { SKIN_NAMES } from "../src/promotion";
import { h } from "../src/ui/dom";
import { enemy, hero, tile } from "../src/ui/sprites";
import { solid } from "../src/ui/sprites/draw";
import { halftone, litGrid, M, S } from "../src/ui/sprites/floor";
import { fit, floor, yaw } from "../src/ui/sprites/mesh";
import { knightEyes, knightModel } from "../src/ui/sprites/models";
import { skinCardElement } from "../src/ui/skinsScreen";
import { svg } from "../src/ui/svg";

const node = (n: SVGElement) => n as unknown as Node;

// -- the clock: how long a jump takes, from the game -----------------------------------------------------
// ui/playback.ts: a step lasts BASE_STEP_MS / speed, and the board's transition takes 0.9 of that (board.ts animate()).
// The speeds the game offers are SPEEDS in settings.ts: 0.5, 1, 2 and 4. A jump is one step, so 1x and 4x are shown.
const BASE_STEP_MS = 420;
const JUMP_MS = BASE_STEP_MS * 0.9;
const LONG_SHARE = 0.6; // the long leg is two squares and the short one is one: the long leg takes the bigger share

// -- the knight art: the real sprite, and two new takes on facing north -----------------------------------

type North = "N1" | "N2" | "N3";
/** The knight's head points along -x; north turns it to this angle (sprites/index.ts KNIGHT_TURN). */
const NORTH = Math.PI / 2;
const NORTH_ANGLE: Record<North, number> = { N1: NORTH, N2: NORTH - 0.55, N3: NORTH - 1.1 };

/** The knight facing north, turned to `angle` instead of straight away: the real art with its solid model swapped. */
function northTurned(angle: number): SVGElement {
  const art = hero("knight", "north");
  const lit = yaw({ faces: knightEyes.map((d) => ({ ...d, part: "eye" })), contour: [] }, angle).faces;
  const model = yaw(knightModel(), angle);
  const f = fit(model, 52, 55, 27.5);
  const { c, rx, ry } = floor(f, 20);
  art.querySelector(":scope > .s")!.replaceWith(node(solid(model, f, lit)));
  const shadow = art.querySelector(".s-shadow")!;
  for (const [name, value] of Object.entries({ cx: c[0] + rx * 0.2, cy: c[1] + ry * 0.35, rx: rx * 1.1, ry: ry * 1.25 })) shadow.setAttribute(name, String(value));
  return art;
}

const knight = (face: Facing, take: North = "N1"): SVGElement => (face === "north" && take !== "N1" ? northTurned(NORTH_ANGLE[take]) : hero("knight", face));

const label = (tag: string, text: string) => h("p", { class: "take-label" }, h("b", {}, tag), text);

// -- pane 1: the knight as the hero -----------------------------------------------------------------------

/** One piece of art on a dark square and a light one, at 128px, and once more at roughly its size on the board. */
function onSquares(art: () => SVGElement): HTMLElement {
  const cell = (square: string, size: number) => node(svg("svg", { class: "cell", viewBox: "-32 -32 64 64", width: size, height: size, "aria-hidden": "true" }, svg("rect", { x: -32, y: -32, width: 64, height: 64, class: square }), art()));
  return h("div", { class: "row" }, cell("sq-dark", 128), cell("sq-light", 128), cell("sq-dark", 64));
}

function heroPane(): HTMLElement {
  const take = (tag: string, text: string, art: () => SVGElement) => h("figure", { class: "take" }, label(tag, text), onSquares(art));
  return h(
    "div",
    { class: "row" },
    take("Pawn", "for scale (south)", () => hero("pawn", "south")),
    take("East", "knight", () => knight("east")),
    take("South", "knight", () => knight("south")),
    take("West", "knight", () => knight("west")),
    take("N1", "north: the current art", () => knight("north", "N1")),
    take("N2", "north: a three-quarter turn, one cheek and its eye show", () => knight("north", "N2")),
    take("N3", "north: nearly in profile, the head turned up and away", () => knight("north", "N3")),
  );
}

// -- the boards ---------------------------------------------------------------------------------------------

interface Spec {
  w: number;
  h: number;
  walls?: Pos[];
  pits?: Pos[];
  rooks?: Pos[];
  attacked?: Pos[];
}

interface Board {
  el: SVGSVGElement;
  under: SVGGElement; // the route, the trails and the landing marks: over the tiles, under the pieces
  at: (pos: Pos) => [number, number];
}

/** A board drawn the way the game's is: squares, tiles, the lit grid, halftone on attacked squares, enemies. */
function board(spec: Spec): Board {
  const at = ([x, y]: Pos): [number, number] => [M + x * S + S / 2, (spec.h - 1 - y) * S + S / 2];
  const el = svg("svg", { class: "board", viewBox: `0 0 ${M + spec.w * S} ${spec.h * S}`, role: "img" });
  halftone(el);
  const squares = svg("g", { class: "squares" });
  const put = (pos: Pos, art: SVGElement) => squares.append(svg("g", { class: "spr", transform: `translate(${at(pos).join(" ")})` }, art));
  for (let y = 0; y < spec.h; y++) for (let x = 0; x < spec.w; x++) squares.append(svg("rect", { x: M + x * S, y: (spec.h - 1 - y) * S, width: S, height: S, class: (x + y) % 2 === 1 ? "sq-light" : "sq-dark" }));
  for (const pos of spec.walls ?? []) put(pos, svg("g", { class: "wall" }, tile("wall")));
  for (const pos of spec.pits ?? []) put(pos, tile("pit"));
  const attacks = svg("g", { class: "attacks", "aria-hidden": "true" }, ...(spec.attacked ?? []).map((pos) => svg("rect", { x: at(pos)[0] - S / 2, y: at(pos)[1] - S / 2, width: S, height: S, class: "attacked" })));
  const under = svg("g", { "aria-hidden": "true" });
  el.append(squares, litGrid(spec.w, spec.h), attacks, under);
  for (const pos of spec.rooks ?? []) el.append(svg("g", { class: "enemy enemy-rook", transform: `translate(${at(pos).join(" ")})` }, enemy("rook", "rest")));
  return { el, under, at };
}

const translate = ([x, y]: [number, number]) => `translate(${x}px, ${y}px)`;
const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** The way a jump (dx, dy) goes: the long leg first, then the short one, and the facing the knight ends with. */
function legs([dx, dy]: Pos, from: Pos): { corner: Pos; to: Pos; longDir: Facing; shortDir: Facing } {
  const horizontal = Math.abs(dx) > Math.abs(dy);
  const to: Pos = [from[0] + dx, from[1] + dy];
  const [sideways, vertical]: [Facing, Facing] = [dx > 0 ? "east" : "west", dy > 0 ? "north" : "south"];
  return { corner: horizontal ? [to[0], from[1]] : [from[0], to[1]], to, longDir: horizontal ? sideways : vertical, shortDir: horizontal ? vertical : sideways };
}

// -- the piece: floor (HUD brackets), shadow and solid are separate, so the solid can hop and the shadow stay down --

interface Piece {
  el: SVGGElement;
  setFace: (face: Facing, turning: boolean) => void;
  lift: SVGGElement;
  shade: SVGGElement;
  floor: SVGGElement;
}

function piece(): Piece {
  const [floorG, shade, lift] = [svg("g", {}), svg("g", {}), svg("g", {})];
  shade.style.transformBox = "fill-box";
  shade.style.transformOrigin = "center";
  const pawn = svg("g", { class: "pawn" }, floorG, shade, lift);
  const el = svg("g", { class: "piece" }, pawn);
  el.style.transition = "none";
  const setFace = (face: Facing, turning: boolean) => {
    const art = knight(face);
    floorG.replaceChildren(art.querySelector(".br")!);
    shade.replaceChildren(art.querySelector(".s-shadow")!);
    lift.replaceChildren(art.querySelector(":scope > .s")!);
    pawn.classList.remove("turning");
    if (turning) {
      pawn.getBoundingClientRect();
      pawn.classList.add("turning");
    }
  };
  return { el, setFace, lift, shade, floor: floorG };
}

let trailIds = 0;

/** One leg of the trail, with the game's own trail classes (a comet tail whose head is the knight). */
function trailLeg(a: [number, number], b: [number, number], ms: number): SVGGElement {
  const id = `kp-trail-${++trailIds}`;
  const [x1, y1, x2, y2] = [a[0], a[1], b[0], b[1]];
  const group = svg(
    "g",
    { class: "trail-hero", style: `--step-ms: ${ms}ms` },
    svg("linearGradient", { id, gradientUnits: "userSpaceOnUse", x1, y1, x2, y2 }, svg("stop", { offset: "0%", class: "trail-tail" }), svg("stop", { offset: "100%", class: "trail-head" })),
    svg("line", { x1, y1, x2, y2, pathLength: 1, stroke: `url(#${id})` }),
  );
  return group;
}

// -- pane 2: the jump ----------------------------------------------------------------------------------------

const JUMP_BOARD: Spec = { w: 6, h: 5, walls: [[2, 1], [3, 1], [3, 2]] };
const START: Pos = [1, 1];
// jump(2, -1), jump(1, 2), jump(-2, 1): each leg of each L crosses a wall
const ROUTE: Pos[] = [[2, -1], [1, 2], [-2, 1]];

interface Mode {
  hop: boolean;
  speed: number;
  reduced: boolean;
}

function jumpRig(): { el: SVGSVGElement; play: (mode: Mode) => Promise<void> } {
  const b = board(JUMP_BOARD);
  // the planned route, dashed and numbered, so the board says where the three jumps go while it is at rest
  let cur = START;
  const plan: string[] = [];
  ROUTE.forEach((jump, i) => {
    const { corner, to } = legs(jump, cur);
    plan.push(`M ${b.at(cur).join(" ")} L ${b.at(corner).join(" ")} L ${b.at(to).join(" ")}`);
    const text = svg("text", { x: b.at(to)[0] + 22, y: b.at(to)[1] - 20, class: "plan-n" });
    text.textContent = String(i + 1);
    b.under.append(text);
    cur = to;
  });
  const planLine = svg("path", { d: plan.join(" "), class: "plan-line" });
  b.under.prepend(planLine);
  const trails = svg("g", {});
  b.under.append(trails);
  const p = piece();
  b.el.append(p.el);
  const place = (pos: Pos) => (p.el.style.transform = translate(b.at(pos)));
  let token = 0;

  const slide = async (from: Pos, to: Pos, ms: number, easing: string) => {
    const keyframes = [{ transform: translate(b.at(from)) }, { transform: translate(b.at(to)) }];
    const motion = p.el.animate(keyframes, { duration: ms, easing, fill: "forwards" });
    await motion.finished;
    place(to);
    motion.cancel();
  };
  const hop = (ms: number) => {
    p.lift.animate([{ transform: "translateY(0)", easing: "ease-out" }, { transform: "translateY(-34px)", offset: 0.5, easing: "ease-in" }, { transform: "translateY(0)" }], { duration: ms });
    p.shade.animate([{ transform: "scale(1)", opacity: 1, easing: "ease-out" }, { transform: "scale(0.7)", opacity: 0.5, offset: 0.5, easing: "ease-in" }, { transform: "scale(1)", opacity: 1 }], { duration: ms });
  };

  const reset = () => {
    token++;
    for (const target of [p.el, p.lift, p.shade]) for (const running of target.getAnimations()) running.cancel();
    trails.replaceChildren();
    place(START);
    p.setFace("east", false);
    b.el.dataset.facing = "east";
    b.el.dataset.at = START.join(",");
    b.el.setAttribute("aria-label", "Jump board: the knight at its start");
  };
  reset();

  const play = async ({ hop: lifts, speed, reduced }: Mode) => {
    reset();
    const mine = token;
    let at = START;
    const face = (f: Facing, turning: boolean) => {
      p.setFace(f, turning);
      b.el.dataset.facing = f;
    };
    try {
      await sleep(250);
      for (const jump of ROUTE) {
        const { corner, to, longDir, shortDir } = legs(jump, at);
        const step = BASE_STEP_MS / speed;
        if (reduced) {
          // what the game does with motion reduced: no slide, no turn, no trail; the piece is simply there
          place(to);
          face(shortDir, false);
          await sleep(BASE_STEP_MS);
        } else {
          const total = JUMP_MS / speed;
          const [first, second] = [total * LONG_SHARE, total * (1 - LONG_SHARE)];
          face(longDir, true);
          trails.append(trailLeg(b.at(at), b.at(corner), first));
          if (lifts) hop(total);
          await slide(at, corner, first, "ease-in");
          face(shortDir, true);
          trails.append(trailLeg(b.at(corner), b.at(to), second));
          await slide(corner, to, second, "ease-out");
          await sleep(step - total);
        }
        if (mine !== token) return;
        at = to;
        b.el.dataset.at = at.join(",");
      }
    } catch {
      // a replay cancelled this run's animations
    }
  };
  return { el: b.el, play };
}

function jumpPane(): HTMLElement {
  const take = (tag: string, text: string, buttons: Array<[string, Mode]>) => {
    const rig = jumpRig();
    rig.el.style.setProperty("--bw", "410px");
    return h(
      "figure",
      { class: "take", "data-take": tag },
      label(tag, text),
      node(rig.el),
      h("div", { class: "buttons" }, ...buttons.map(([name, mode]) => h("button", { class: "btn btn-small", onClick: () => void rig.play(mode) }, name))),
    );
  };
  const slideMode = (speed: number, hop = false, reduced = false): Mode => ({ hop, speed, reduced });
  return h(
    "div",
    {},
    h("p", { class: "note" }, "Three jumps on one route: jump(2, -1), jump(1, 2), jump(-2, 1), each crossing a wall. Long leg first, then the short one; the knight turns into the short leg, so it ends facing east, north, then north. A step is 420 ms at 1x and 105 ms at 4x (the game offers 0.5, 1, 2 and 4: settings.ts SPEEDS; playback.ts BASE_STEP_MS), the move itself 0.9 of that. Click a button to play, again to replay."),
    h(
      "div",
      { class: "row" },
      take("J1", "slide along the L: long leg, a turn at the corner, short leg", [["Play 1x", slideMode(1)], ["Play 4x", slideMode(4)]]),
      take("J2", "hop along the L: the knight lifts off, its shadow stays on the floor", [["Play 1x", slideMode(1, true)], ["Play 4x", slideMode(4, true)]]),
      take("R", "motion reduced: no slide, no hop, no trail, no turn; the same for J1 and J2", [["Play", slideMode(1, false, true)]]),
    ),
  );
}

// -- pane 3: the trail -----------------------------------------------------------------------------------------

function trailBoard(caption: string, jump: Pos, progress: number): HTMLElement {
  const b = board({ w: 6, h: 5, walls: [[2, 1], [3, 1], [3, 2]] });
  const start: Pos = jump[0] > 0 ? [1, 1] : [4, 2];
  const { corner, to, longDir, shortDir } = legs(jump, start);
  const [a, c, d] = [b.at(start), b.at(corner), b.at(to)];
  // `progress` is how far along the short leg the knight is; 1 is landed
  const head: [number, number] = [c[0] + (d[0] - c[0]) * progress, c[1] + (d[1] - c[1]) * progress];
  const trails = svg("g", { class: "still" }, trailLeg(a, c, 350), trailLeg(c, head, 350));
  b.under.append(trails);
  const p = piece();
  p.setFace(shortDir, false);
  p.el.style.transform = translate(head);
  b.el.append(p.el);
  b.el.style.setProperty("--bw", "400px");
  return h("figure", { class: "take" }, h("p", { class: "take-label" }, caption, ` (long leg ${longDir}, short leg ${shortDir})`), node(b.el));
}

function trailPane(): HTMLElement {
  return h(
    "div",
    {},
    h("p", { class: "note" }, "The game's own trail (a cyan comet tail, head on the piece, thinning behind it), drawn as the L: one streak for the long leg and one for the short leg, the knight at the head of the second. In the game it draws as the knight slides, fades about a second after, and is never built with motion reduced. Held still here."),
    h("div", { class: "row" }, trailBoard("T · mid-jump, on the short leg", [1, 2], 0.5), trailBoard("T · landed after jump(1, 2)", [1, 2], 1), trailBoard("T · landed after jump(-2, 1)", [-2, 1], 1)),
  );
}

// -- pane 4: the landing squares -------------------------------------------------------------------------------

type Mark = "M1" | "M2" | "M3";
const MARK_TEXT: Record<Mark, string> = { M1: "corner brackets", M2: "a ring", M3: "a double chevron, pointing the way the knight would face on landing" };
const KNIGHT_AT: Pos = [3, 3];
const L_JUMPS: Pos[] = [[1, 2], [-1, 2], [2, 1], [-2, 1], [2, -1], [-2, -1], [1, -2], [-1, -2]];
const LANDING_BOARD: Spec = {
  w: 7,
  h: 7,
  walls: [[5, 4]],
  pits: [[0, 5]],
  rooks: [[6, 1]],
  // the rook's rank and file
  attacked: [0, 1, 2, 3, 4, 5].map((x): Pos => [x, 1]).concat([0, 2, 3, 4, 5, 6].map((y): Pos => [6, y])),
};
const TURN: Record<Facing, number> = { east: 0, south: 90, west: 180, north: -90 };

function markArt(kind: Mark, facing: Facing): SVGGElement {
  const draw = (klass: string) => {
    if (kind === "M2") return svg("circle", { r: 21, class: klass });
    const d = kind === "M1" ? "M -24 -14 V -24 H -14 M 14 -24 H 24 V -14 M 24 14 V 24 H 14 M -14 24 H -24 V 14" : "M -14 -12 L -2 0 L -14 12 M -2 -12 L 10 0 L -2 12";
    return svg("path", { d, class: klass, ...(kind === "M3" ? { transform: `rotate(${TURN[facing]})` } : {}) });
  };
  return svg("g", { class: "land" }, draw("halo"), draw("ink"));
}

function landingBoard(kind: Mark, version: "V1" | "V2", grey: boolean): HTMLElement {
  const b = board(LANDING_BOARD);
  for (const jump of L_JUMPS) {
    const { to, shortDir } = legs(jump, KNIGHT_AT);
    const onBoard = to[0] >= 0 && to[0] < LANDING_BOARD.w && to[1] >= 0 && to[1] < LANDING_BOARD.h;
    const wall = LANDING_BOARD.walls!.some((w) => w[0] === to[0] && w[1] === to[1]);
    if (!onBoard || (version === "V2" && wall)) continue;
    b.under.append(svg("g", { transform: `translate(${b.at(to).join(" ")})` }, markArt(kind, shortDir)));
  }
  const p = piece();
  p.setFace("north", false);
  p.el.style.transform = translate(b.at(KNIGHT_AT));
  b.el.append(p.el);
  b.el.style.setProperty("--bw", grey ? "250px" : "380px");
  return h("figure", { class: `take${grey ? " grey" : ""}` }, h("p", { class: "take-label" }, h("b", {}, `${kind} ${version}`), grey ? "colour removed" : version === "V1" ? "all eight L squares on the board" : "only the squares it can land on: not the wall"), node(b.el));
}

function landingPane(): HTMLElement {
  const row = (kind: Mark) =>
    h("div", { class: "row" }, landingBoard(kind, "V1", false), landingBoard(kind, "V2", false), landingBoard(kind, "V2", true));
  return h(
    "div",
    {},
    h("p", { class: "note" }, "The knight on d4 facing north; a wall (f5), a pit (a6) and a rook (g2) with the rank and file it attacks drawn as halftone dots. Each mark is a line shape over a halo, so it reads against the dots; the third board of each row is the same with colour removed."),
    ...(["M1", "M2", "M3"] as Mark[]).map((kind) => h("div", {}, h("p", { class: "take-label" }, h("b", {}, kind), MARK_TEXT[kind]), row(kind))),
  );
}

// -- pane 5: Settings → Piece, and the skins gallery --------------------------------------------------------

function settingsAndSkins(scheme: string): HTMLElement {
  const choice = (text: string, checked = false) => h("label", { class: "choice" }, h("input", { type: "radio", name: `piece-${scheme}`, checked }), h("span", {}, text));
  const settingsMock = h(
    "div",
    { class: "settings-dialog mock-settings" },
    h(
      "fieldset",
      {},
      h("legend", {}, "Piece"),
      h("p", { class: "muted small" }, "How your piece looks. Auto: each level uses the piece it was made for. Or pick a skin, once you have earned its promotion, to wear it on every level."),
      h("div", { class: "choices" }, choice("Auto", true), choice("Pawn"), choice(`Knight · ${SKIN_NAMES.knight}`)),
    ),
  );
  const auto = h(
    "div",
    { class: "skin-card worn", tabindex: "0", "aria-label": "Auto, worn: each level's own piece" },
    h("div", { class: "skin-art" }, node(svg("svg", { viewBox: "-76 -38 152 76", width: 190, height: 95, "aria-hidden": "true" }, svg("g", { transform: "translate(-38 0)" }, hero("pawn", "south")), svg("g", { transform: "translate(38 0)" }, hero("knight", "east"))))),
    h("strong", {}, "Auto: each level's own piece"),
    h("span", { class: "muted small" }, "The Pawn on the Pawn tier's levels, the Knight on the Knight tier's"),
    h("span", { class: "skin-worn" }, h("span", { "aria-hidden": "true" }, "✓ "), "Worn"),
  );
  const noop = () => {};
  const gallery = h(
    "div",
    { class: "free-play" },
    h("h1", { class: "free-title" }, "Skins"),
    h("div", { class: "skins" }, auto, skinCardElement({ piece: "pawn", name: SKIN_NAMES.pawn, unlocked: true, worn: false, how: "Yours from the start" }, noop), skinCardElement({ piece: "knight", name: SKIN_NAMES.knight, unlocked: true, worn: false, how: "Unlocked by the Pawn tier's promotion" }, noop)),
  );
  return h("div", { class: "row" }, h("figure", { class: "take" }, label("S", "Settings → Piece, with Auto first and selected"), settingsMock), h("figure", { class: "take" }, label("G", "the Skins gallery, with the Auto card first and worn"), gallery));
}

// -- the sheet --------------------------------------------------------------------------------------------------

const pane = (scheme: "dark" | "light", name: string, ...children: HTMLElement[]) => h("div", { class: "pane", "data-scheme": scheme }, h("p", { class: "pane-name" }, name), ...children);
const both = (name: string, build: (scheme: "dark" | "light") => HTMLElement) => (["dark", "light"] as const).map((scheme) => pane(scheme, `${name} · ${scheme}`, build(scheme)));

document.getElementById("sheet")!.append(
  h(
    "header",
    { class: "sheet-head" },
    h("h1", {}, "The knight as the piece"),
    h("p", {}, "M5.1 design sheet. A jump is drawn as its L: the long leg first, then the short leg, the knight turning into the short leg, so jump(1, 2) (up two, right one) ends facing east and jump(-2, 1) (left two, up one) ends facing north. Choose between the labelled takes: N1-N3 (facing north), J1-J2 (the jump's motion), M1-M3 with V1 or V2 (the landing marks)."),
  ),
  ...both("1 · The knight as the hero", heroPane),
  ...both("2 · The jump", jumpPane),
  ...both("3 · The trail", trailPane),
  ...both("4 · The landing squares", landingPane),
  ...both("5 · Settings → Piece and the skins gallery", settingsAndSkins),
);
