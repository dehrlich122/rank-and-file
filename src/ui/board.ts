// The board, drawn as SVG: squares, tiles (walls, signposts, gates, pits), the
// goal and the piece.
//
// The board never decides anything. It draws the states the engine reported:
// `show()` jumps straight to a state, `animate()` plays a step's events in order.
//
// Each tile type has its own draw function (TILE_ART below) and CSS classes, and
// every colour comes from the CSS custom properties in styles.css, so a visual
// redesign can reskin tiles without touching the logic.
import type { Facing, GameEvent, LevelInfo, Pos, TileKind, WorldState } from "../py/protocol";

const SVG = "http://www.w3.org/2000/svg";
const S = 64; // size of one square, in SVG units
const M = 22; // margin for the file letters and rank numbers

const FACING_ANGLE: Record<Facing, number> = { north: 0, east: 90, south: 180, west: 270 };

export function squareName([x, y]: Pos): string {
  return `${String.fromCharCode(97 + x)}${y + 1}`;
}

export class BoardView {
  readonly element: SVGSVGElement;
  private readonly piece: SVGGElement; // moves between squares
  private readonly body: SVGGElement; // shakes on a bump
  private readonly pointer: SVGGElement; // rotates to show the facing
  private readonly flash: SVGRectElement;
  private readonly lostMark: SVGGElement; // where the run was lost (M3.1)
  private readonly gates = new Map<string, SVGGElement>(); // "x,y" -> gate art
  private angle = 0; // cumulative, so turns always take the short way round
  private timers: number[] = [];

  /**
   * `spots`: after a run with a hidden goal, whether the code reached it with
   * the goal on each ? square, by square name ("b3"). Without it they show ?.
   */
  constructor(
    private readonly level: LevelInfo,
    options: { mini?: boolean; spots?: ReadonlyMap<string, boolean> } = {},
  ) {
    const { width, height } = level;
    this.element = svg("svg", {
      class: options.mini ? "board board-mini" : "board",
      viewBox: `0 0 ${M + width * S} ${height * S + M}`,
      role: "img",
      "aria-label": `${width} by ${height} board`,
    });

    const squares = svg("g", { class: "squares" });
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const [left, top] = corner([x, y], height);
        const light = (x + y) % 2 === 1;
        squares.append(svg("rect", { x: left, y: top, width: S, height: S, class: light ? "sq-light" : "sq-dark" }));
        const art = TILE_ART[level.tiles[y]?.[x] ?? "floor"]?.(left, top, level, [x, y]);
        if (art) squares.append(art);
        if (art?.classList.contains("gate")) this.gates.set(`${x},${y}`, art);
      }
    }
    this.element.append(squares, labels(width, height));

    // A hidden goal (M2): a mark on every square it might be on, except the
    // one where it is in the case being shown (that one gets the flag).
    for (const pos of level.goal_spots) {
      if (level.goal && squareName(pos) === squareName(level.goal)) continue;
      const [left, top] = corner(pos, height);
      squares.append(spot(left, top, options.spots?.get(squareName(pos))));
    }
    if (level.goal) {
      const [left, top] = corner(level.goal, height);
      squares.append(flag(left, top));
    }

    this.flash = svg("rect", { class: "bump-flash", width: S, height: S, x: 0, y: 0 });
    this.element.append(this.flash);

    this.piece = svg("g", { class: "piece" });
    this.body = svg("g", { class: "piece-body" });
    this.pointer = svg("g", { class: "piece-pointer" });
    this.pointer.append(svg("path", { d: `M 0 ${-S * 0.47} L 7 ${-S * 0.36} L -7 ${-S * 0.36} Z` }));
    this.body.append(this.pointer, pawnShape());
    this.piece.append(this.body);
    this.element.append(this.piece);

    this.lostMark = lostMark();
    this.element.append(this.lostMark);

    this.show(level.start);
  }

  /** Jump straight to a state, with no animation. */
  show(state: WorldState): void {
    this.cancel();
    this.piece.style.transition = "none";
    this.pointer.style.transition = "none";
    this.angle = FACING_ANGLE[state.facing];
    this.place(state);
    this.element.getBoundingClientRect(); // apply now, before transitions come back
    this.piece.style.transition = "";
    this.pointer.style.transition = "";
    this.setCelebrating(false);
  }

  /** Play a step's events one after another, spread over `totalMs`. */
  animate(events: GameEvent[], totalMs: number): void {
    this.cancel();
    if (events.length === 0) return;
    const each = totalMs / events.length;
    this.element.style.setProperty("--step-ms", `${Math.round(each * 0.9)}ms`);
    events.forEach((event, i) => {
      this.timers.push(window.setTimeout(() => this.apply(event), i * each));
    });
  }

  setCelebrating(on: boolean): void {
    this.element.classList.toggle("celebrate", on);
  }

  private apply(event: GameEvent): void {
    if (event.kind === "turn") {
      const target = FACING_ANGLE[event.state.facing];
      const current = ((this.angle % 360) + 360) % 360;
      this.angle += ((target - current + 540) % 360) - 180;
    }
    this.place(event.state);
    if (event.kind === "bump" && event.at) this.bump(event.state.pos, event.at);
    if (event.kind === "guard" && event.at) {
      const gate = this.gates.get(`${event.at[0]},${event.at[1]}`);
      if (gate) restartAnimation(gate, "refusing");
    }
  }

  private place(state: WorldState): void {
    const [left, top] = corner(state.pos, this.level.height);
    this.piece.style.transform = `translate(${left + S / 2}px, ${top + S / 2}px)`;
    this.pointer.style.transform = `rotate(${this.angle}deg)`;
    const opened = new Set((state.opened ?? []).map(([x, y]) => `${x},${y}`));
    for (const [key, gate] of this.gates) gate.classList.toggle("open", opened.has(key));
    this.element.classList.toggle("lost", Boolean(state.lost));
    if (state.lost) {
      const [lostLeft, lostTop] = corner(state.lost, this.level.height);
      this.lostMark.setAttribute("transform", `translate(${lostLeft} ${lostTop})`);
    }
  }

  private bump(from: Pos, at: Pos): void {
    const dx = Math.sign(at[0] - from[0]);
    const dy = Math.sign(at[1] - from[1]);
    this.body.style.setProperty("--bx", `${dx * 10}px`);
    this.body.style.setProperty("--by", `${-dy * 10}px`);
    restartAnimation(this.body, "bumping");
    const [left, top] = corner(at, this.level.height);
    this.flash.setAttribute("x", String(left));
    this.flash.setAttribute("y", String(top));
    restartAnimation(this.flash, "flashing");
  }

  private cancel(): void {
    this.timers.forEach((timer) => window.clearTimeout(timer));
    this.timers = [];
  }

  dispose(): void {
    this.cancel();
  }
}

/** Top-left corner of a square in SVG units. Rank 1 is at the bottom. */
function corner([x, y]: Pos, height: number): [number, number] {
  return [M + x * S, (height - 1 - y) * S];
}

function labels(width: number, height: number): SVGGElement {
  const group = svg("g", { class: "coords" });
  for (let x = 0; x < width; x++) {
    const text = svg("text", { x: M + x * S + S / 2, y: height * S + M * 0.72, "text-anchor": "middle" });
    text.textContent = String.fromCharCode(97 + x);
    group.append(text);
  }
  for (let y = 0; y < height; y++) {
    const text = svg("text", { x: M * 0.45, y: (height - 1 - y) * S + S / 2 + 5, "text-anchor": "middle" });
    text.textContent = String(y + 1);
    group.append(text);
  }
  return group;
}

// -- tile art -------------------------------------------------------------------

type TileArt = (left: number, top: number, level: LevelInfo, pos: Pos) => SVGGElement;

const TILE_ART: Record<TileKind, TileArt | null> = {
  floor: null,
  wall: (left, top) => wall(left, top),
  sign: (left, top, level, [x, y]) =>
    signpost(left, top, level.signs.find((sign) => sign.pos[0] === x && sign.pos[1] === y)?.text ?? ""),
  gate: (left, top) => gate(left, top),
  pit: (left, top) => pit(left, top),
};

function wall(left: number, top: number): SVGGElement {
  const group = svg("g", { class: "wall" });
  group.append(
    svg("rect", { x: left + 1, y: top + 1, width: S - 2, height: S - 2, rx: 4, class: "wall-outer" }),
    svg("rect", { x: left + 6, y: top + 6, width: S - 12, height: S - 12, rx: 3, class: "wall-inner" }),
  );
  return group;
}

function signpost(left: number, top: number, text: string): SVGGElement {
  const group = svg("g", { class: "signpost" });
  const title = svg("title", {});
  title.textContent = text;
  group.append(
    title,
    svg("rect", { x: left + S / 2 - 3, y: top + S * 0.35, width: 6, height: S * 0.55, class: "sign-post" }),
    svg("rect", { x: left + 8, y: top + 10, width: S - 16, height: S * 0.34, rx: 3, class: "sign-board" }),
    svg("path", { d: `M ${left + 14} ${top + 18} h ${S - 28} M ${left + 14} ${top + 25} h ${S - 36}`, class: "sign-lines" }),
  );
  return group;
}

/** A barred gate with a padlock. The `open` class lifts the bars (see styles.css). */
function gate(left: number, top: number): SVGGElement {
  const group = svg("g", { class: "gate" });
  const title = svg("title", {});
  title.textContent = "A locked gate. A guard keeps it shut.";
  const bars = svg("g", { class: "gate-bars" });
  for (let i = 0; i < 5; i++) {
    bars.append(svg("rect", { x: left + 9 + i * 10.5, y: top + 6, width: 4, height: S - 12, rx: 1.5 }));
  }
  bars.append(svg("rect", { x: left + 6, y: top + 16, width: S - 12, height: 4, rx: 1.5 }));
  bars.append(svg("rect", { x: left + 6, y: top + S - 20, width: S - 12, height: 4, rx: 1.5 }));
  const lock = svg("g", { class: "gate-lock" });
  lock.append(
    svg("path", { d: `M ${left + S / 2 - 6} ${top + S / 2 - 2} v -5 a 6 6 0 0 1 12 0 v 5`, class: "gate-shackle" }),
    svg("rect", { x: left + S / 2 - 9, y: top + S / 2 - 2, width: 18, height: 14, rx: 2.5, class: "gate-padlock" }),
  );
  group.append(title, svg("rect", { x: left + 2, y: top + 2, width: S - 4, height: S - 4, rx: 3, class: "gate-frame" }), bars, lock);
  return group;
}

/** A pit (M3.1): stepping in loses the run. */
function pit(left: number, top: number): SVGGElement {
  const group = svg("g", { class: "pit" });
  const title = svg("title", {});
  title.textContent = "A pit. Step in and the run is lost.";
  group.append(
    title,
    svg("ellipse", { cx: left + S / 2, cy: top + S / 2, rx: S * 0.42, ry: S * 0.38, class: "pit-rim" }),
    svg("ellipse", { cx: left + S / 2, cy: top + S / 2 + 3, rx: S * 0.33, ry: S * 0.28, class: "pit-hole" }),
  );
  return group;
}

/** The ring that marks where a run was lost, moved onto that square (M3.1). */
function lostMark(): SVGGElement {
  const group = svg("g", { class: "lost-mark", "aria-hidden": "true" });
  const cross = svg("text", { x: S - 10, y: 18, "text-anchor": "middle", class: "lost-cross" });
  cross.textContent = "✗";
  group.append(svg("rect", { x: 2, y: 2, width: S - 4, height: S - 4, rx: 6, class: "lost-ring" }), cross);
  return group;
}

function flag(left: number, top: number): SVGGElement {
  const group = svg("g", { class: "goal" });
  group.append(
    svg("circle", { cx: left + S / 2, cy: top + S / 2, r: S * 0.4, class: "goal-ring" }),
    svg("rect", { x: left + S * 0.36, y: top + S * 0.2, width: 3.5, height: S * 0.62, class: "goal-pole" }),
    svg("path", {
      d: `M ${left + S * 0.36 + 3.5} ${top + S * 0.2} l ${S * 0.34} ${S * 0.12} l ${-S * 0.34} ${S * 0.12} Z`,
      class: "goal-flag",
    }),
  );
  return group;
}

/** A square a hidden goal might be on: a dashed ring with ?, or after a run ✓ or ✗ (`passed`). */
function spot(left: number, top: number, passed?: boolean): SVGGElement {
  const group = svg("g", { class: passed === undefined ? "spot" : passed ? "spot spot-pass" : "spot spot-fail" });
  const title = svg("title", {});
  title.textContent = passed === undefined ? "The goal might be here." : passed ? "Your code reached the goal here." : "Your code missed the goal here.";
  const mark = svg("text", { x: left + S / 2, y: top + S / 2 + 9, "text-anchor": "middle", class: "spot-mark" });
  mark.textContent = passed === undefined ? "?" : passed ? "✓" : "✗";
  group.append(title, svg("circle", { cx: left + S / 2, cy: top + S / 2, r: S * 0.36, class: "spot-ring" }), mark);
  return group;
}

/** A simple pawn silhouette, centred on (0, 0). */
function pawnShape(): SVGGElement {
  const group = svg("g", { class: "pawn" });
  group.append(
    svg("ellipse", { cx: 0, cy: 22, rx: 17, ry: 4.5, class: "pawn-shadow" }),
    svg("path", {
      d: "M -15 21 Q -15 14 -9 13 L -6 3 Q -11 1 -11 -3 Q -11 -6 -6 -6 L 6 -6 Q 11 -6 11 -3 Q 11 1 6 3 L 9 13 Q 15 14 15 21 Z",
      class: "pawn-fill",
    }),
    svg("circle", { cx: 0, cy: -14, r: 9, class: "pawn-fill" }),
  );
  return group;
}

function restartAnimation(element: Element, className: string): void {
  element.classList.remove(className);
  element.getBoundingClientRect();
  element.classList.add(className);
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, String(value));
  return element;
}
