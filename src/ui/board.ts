// The board, drawn as SVG: squares, tiles (walls, signposts, gates, pits,
// waypoints, gems, timed gates, planks), the goal, the enemies and their
// routes (M3.1) and the piece.
//
// The board never decides anything. It draws the states the engine reported:
// `show()` jumps straight to a state, `animate()` plays a step's events in order.
//
// Each tile type has its own draw function (TILE_ART below) and CSS classes, and
// every colour comes from the CSS custom properties in styles.css, so a visual
// redesign can reskin tiles without touching the logic.
import type { Clock, Enemy, Facing, GameEvent, LevelInfo, Pos, TileKind, WorldState } from "../py/protocol";

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
  private readonly enemies: SVGGElement[]; // one per level.enemies, moved like the piece
  private readonly counters: SVGGElement[]; // badges that count a clock's ticks: clockwork's (QA-021), timed gates' (M3.2)
  private readonly art = new Map<TileKind, Map<string, SVGGElement>>(); // tile kind -> "x,y" -> its art
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
        const kind = level.tiles[y]?.[x] ?? "floor";
        const art = TILE_ART[kind]?.(left, top, level, [x, y]);
        if (art) {
          squares.append(art);
          if (!this.art.has(kind)) this.art.set(kind, new Map());
          this.art.get(kind)!.set(`${x},${y}`, art);
        }
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

    // Enemies (M3.1): every patrol's route, dotted, and the enemies themselves, under the piece.
    for (const enemy of level.enemies) if (enemy.route.length > 1) squares.append(route(enemy, height));
    this.enemies = level.enemies.map((enemy) => enemyPiece(enemy, level));

    this.flash = svg("rect", { class: "bump-flash", width: S, height: S, x: 0, y: 0 });
    this.element.append(this.flash, ...this.enemies);

    this.piece = svg("g", { class: "piece" });
    this.body = svg("g", { class: "piece-body" });
    this.pointer = svg("g", { class: "piece-pointer" });
    this.pointer.append(svg("path", { d: `M 0 ${-S * 0.47} L 7 ${-S * 0.36} L -7 ${-S * 0.36} Z` }));
    this.body.append(this.pointer, pawnShape());
    this.piece.append(this.body);
    this.element.append(this.piece);

    this.lostMark = lostMark();
    this.element.append(this.lostMark);
    this.counters = [...this.element.querySelectorAll<SVGGElement>("[data-clock]")];

    this.show(level.start);
  }

  /** Jump straight to a state, with no animation. */
  show(state: WorldState): void {
    this.cancel();
    const moving = [this.piece, this.pointer, ...this.enemies];
    for (const element of moving) element.style.transition = "none";
    this.angle = FACING_ANGLE[state.facing];
    this.place(state);
    this.element.getBoundingClientRect(); // apply now, before transitions come back
    for (const element of moving) element.style.transition = "";
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
      const gate = this.art.get("gate")?.get(`${event.at[0]},${event.at[1]}`);
      if (gate) restartAnimation(gate, "refusing");
    }
  }

  private place(state: WorldState): void {
    this.piece.style.transform = centre(state.pos, this.level.height);
    this.pointer.style.transform = `rotate(${this.angle}deg)`;
    this.mark("gate", "open", state.opened);
    this.mark("timed_gate", "open", state.opened);
    this.mark("waypoint", "crossed", state.crossed);
    this.mark("gem", "collected", state.collected);
    this.mark("plank", "collected", state.collected);
    this.mark("pit", "bridged", state.bridged);
    (state.enemies ?? []).forEach((pos, i) => {
      const enemy = this.enemies[i];
      if (!enemy) return;
      enemy.classList.toggle("gone", pos === null);
      if (pos) enemy.style.transform = centre(pos, this.level.height);
    });
    for (const counter of this.counters) {
      const clock = counter.dataset.clock as Clock;
      const ticks = clock === "action" ? state.tick : (state.clock_ticks?.[clock] ?? 0);
      setBadgeText(counter, counter.dataset.template!.replace("{n}", String(ticks)));
    }
    this.element.classList.toggle("lost", Boolean(state.lost));
    if (state.lost) {
      const [lostLeft, lostTop] = corner(state.lost, this.level.height);
      this.lostMark.setAttribute("transform", `translate(${lostLeft} ${lostTop})`);
    }
  }

  /** Set `className` on the art of each `kind` tile that's in `where`, and clear it from the rest. */
  private mark(kind: TileKind, className: string, where: Pos[] = []): void {
    const tiles = this.art.get(kind);
    if (!tiles) return;
    const on = new Set(where.map(([x, y]) => `${x},${y}`));
    for (const [key, art] of tiles) art.classList.toggle(className, on.has(key));
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

/** The CSS transform that centres a piece (drawn around (0, 0)) on a square. */
function centre(pos: Pos, height: number): string {
  const [left, top] = corner(pos, height);
  return `translate(${left + S / 2}px, ${top + S / 2}px)`;
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
  sign: (left, top, level, pos) => signpost(left, top, find(level.signs, pos)?.text ?? ""),
  gate: (left, top, level, pos) => {
    const question = find(level.questions, pos)?.text;
    return question ? gate(left, top, `The guard asks: "${question}"`, "?") : gate(left, top, "A locked gate. A guard keeps it shut.");
  },
  timed_gate: (left, top, level, pos) => {
    const timer = find(level.timed_gates, pos);
    const timing = `${timer?.open ?? 0} of ${timer?.every ?? 0}`;
    // Its clock's count, live during playback: clockwork's gear (QA-021), or the pawn's ticks (M3.2).
    const clock = timer?.clock ?? "action";
    const label = counts(level, clock) ? `${GEAR} {n} · ${timing}` : `${timing} · tick {n}`;
    return gate(left, top, timer?.text ?? "A timed gate.", label, true, clock);
  },
  pit: (left, top) => pit(left, top),
  plank: (left, top) => plank(left, top, "plank", "A plank. Walk over it to pick it up; bridge() lays it over a pit."),
  waypoint: (left, top) => waypoint(left, top),
  gem: (left, top) => gem(left, top),
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
  const title = tooltip(text);
  group.append(
    title,
    svg("rect", { x: left + S / 2 - 3, y: top + S * 0.35, width: 6, height: S * 0.55, class: "sign-post" }),
    svg("rect", { x: left + 8, y: top + 10, width: S - 16, height: S * 0.34, rx: 3, class: "sign-board" }),
    svg("path", { d: `M ${left + 14} ${top + 18} h ${S - 28} M ${left + 14} ${top + 25} h ${S - 36}`, class: "sign-lines" }),
  );
  return group;
}

/** The entry for the square `pos`, from one of the level's lists of details. */
function find<T extends { pos: Pos }>(items: T[], [x, y]: Pos): T | undefined {
  return items.find((item) => item.pos[0] === x && item.pos[1] === y);
}

/**
 * Whether `clock` keeps time with the code rather than the piece: shown with a
 * gear that counts its ticks (M3.1, QA-021). The engine reports these clocks'
 * counts in every state on such levels, so the board takes the list from there.
 */
function counts(level: LevelInfo, clock: Clock | undefined): boolean {
  return clock !== undefined && clock in (level.start.clock_ticks ?? {});
}

/**
 * A barred gate. The `open` class lifts the bars (see styles.css). A guarded
 * gate has a padlock; a timed one (M3.1) has none. `label`: a short badge
 * along the bottom, e.g. a timed gate's "2 of 3", or "?" for a guard's question;
 * `clock`: the clock whose count fills its "{n}".
 */
function gate(left: number, top: number, text: string, label = "", timed = false, clock?: Clock): SVGGElement {
  const group = svg("g", { class: timed ? "gate timed-gate" : "gate" });
  const title = tooltip(text);
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
  group.append(title, svg("rect", { x: left + 2, y: top + 2, width: S - 4, height: S - 4, rx: 3, class: "gate-frame" }), bars);
  if (!timed) group.append(lock);
  if (label) group.append(badge(left + S / 2, top + S - 16, label, clock));
  return group;
}

/** A plank (QA-017), lying on the floor or laid over a pit (`className` "pit-plank"). */
function plank(left: number, top: number, className: string, text: string): SVGGElement {
  const group = svg("g", { class: className });
  group.append(
    tooltip(text),
    svg("rect", { x: left + 8, y: top + S / 2 - 9, width: S - 16, height: 18, rx: 3, class: "plank-wood" }),
    svg("path", { d: `M ${left + 12} ${top + S / 2 - 3} h ${S - 24} M ${left + 12} ${top + S / 2 + 3} h ${S - 30}`, class: "plank-grain" }),
  );
  return group;
}

/** A pit (M3.1): stepping in loses the run. The `bridged` class shows a plank laid over it (QA-017). */
function pit(left: number, top: number): SVGGElement {
  const group = svg("g", { class: "pit" });
  const title = tooltip("A pit. Step in and the run is lost.");
  group.append(
    title,
    svg("ellipse", { cx: left + S / 2, cy: top + S / 2, rx: S * 0.42, ry: S * 0.38, class: "pit-rim" }),
    svg("ellipse", { cx: left + S / 2, cy: top + S / 2 + 3, rx: S * 0.33, ry: S * 0.28, class: "pit-hole" }),
    plank(left, top, "pit-plank", "A pit with a plank over it: safe to cross."),
  );
  return group;
}

/** A waypoint (M3.1): a ring to pass over on the way to the goal; ✓ once crossed. */
function waypoint(left: number, top: number): SVGGElement {
  const group = svg("g", { class: "waypoint" });
  const title = tooltip("A waypoint. Pass over it on the way to the goal.");
  const tick = svg("text", { x: left + S / 2, y: top + S / 2 + 8, "text-anchor": "middle", class: "waypoint-tick" });
  tick.textContent = "✓";
  group.append(title, svg("circle", { cx: left + S / 2, cy: top + S / 2, r: S * 0.3, class: "waypoint-ring" }), tick);
  return group;
}

/** A gem (M3.1): picked up by walking over it, so it vanishes once collected. */
function gem(left: number, top: number): SVGGElement {
  const group = svg("g", { class: "gem" });
  const title = tooltip("A gem. Walk over it to collect it.");
  const [cx, cy] = [left + S / 2, top + S / 2];
  group.append(
    title,
    svg("path", { d: `M ${cx - 13} ${cy - 5} L ${cx - 6} ${cy - 13} L ${cx + 6} ${cy - 13} L ${cx + 13} ${cy - 5} L ${cx} ${cy + 14} Z`, class: "gem-body" }),
    svg("path", { d: `M ${cx - 13} ${cy - 5} H ${cx + 13} M ${cx - 6} ${cy - 13} L ${cx - 3} ${cy - 5} L ${cx} ${cy + 14} M ${cx + 6} ${cy - 13} L ${cx + 3} ${cy - 5}`, class: "gem-facets" }),
  );
  return group;
}

/** A patrol's route (M3.1): a dotted line through its corners, closed for a loop. */
function route(enemy: Enemy, height: number): SVGPathElement {
  const points = enemy.route.map((pos) => corner(pos, height).map((n) => n + S / 2).join(" "));
  return svg("path", { d: `M ${points.join(" L ")}${enemy.loop ? " Z" : ""}`, class: "route" });
}

/**
 * An enemy (M3.1), centred on (0, 0) and moved by `place()`. Its badges: a
 * chaser's "chases", a gear for clockwork (it keeps time with the code), and
 * "armoured".
 */
function enemyPiece(enemy: Enemy, level: LevelInfo): SVGGElement {
  const group = svg("g", { class: `enemy enemy-${enemy.kind}${enemy.armoured ? " armoured" : ""}` });
  const counted = counts(level, enemy.clock);
  const clock = counted ? ", keeping time with your code" : "";
  const title = tooltip(`A ${enemy.kind}${clock}${enemy.armoured ? ". It's armoured" : ""}.`);
  group.append(
    title,
    svg("circle", { cx: 0, cy: 2, r: S * 0.3, class: "enemy-body" }),
    svg("circle", { cx: -6, cy: -2, r: 3.2, class: "enemy-eye" }),
    svg("circle", { cx: 6, cy: -2, r: 3.2, class: "enemy-eye" }),
  );
  const badges = [enemy.kind === "chaser" ? "chases" : "", counted ? `${GEAR} {n}` : "", enemy.armoured ? "armoured" : ""].filter(Boolean);
  if (badges.length) group.append(badge(0, -S * 0.3 - 12, badges.join(" "), counted ? enemy.clock : undefined));
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
  const title = tooltip(passed === undefined ? "The goal might be here." : passed ? "Your code reached the goal here." : "Your code missed the goal here.");
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

// The gear badge for clockwork, drawn as text (U+FE0E), never as a colour emoji, so it follows the theme.
const GEAR = "⚙\uFE0E";

/**
 * A small rounded label, centred on `cx` with its top at `y`: a timed gate's
 * "2 of 3", an enemy's "chases" (M3.1). With a `clock`, its text is a
 * template: `place()` fills in "{n}" with that clock's ticks (QA-021).
 */
function badge(cx: number, y: number, text: string, clock?: Clock): SVGGElement {
  const group = svg("g", { class: "badge-group" });
  group.dataset.template = text;
  if (clock) group.dataset.clock = clock;
  group.append(svg("rect", { y, height: 14, rx: 7, class: "badge" }), svg("text", { x: cx, y: y + 10.5, "text-anchor": "middle", class: "badge-text" }));
  setBadgeText(group, text.replace("{n}", "0"));
  return group;
}

/** Change a badge's text, resizing its pill to fit. */
function setBadgeText(group: SVGGElement, text: string): void {
  const [pill, label] = [group.querySelector("rect")!, group.querySelector("text")!];
  if (label.textContent === text) return;
  label.textContent = text;
  const width = Math.max(16, text.length * 6.5 + 8);
  pill.setAttribute("width", String(width));
  pill.setAttribute("x", String(Number(label.getAttribute("x")) - width / 2));
}

/** An SVG <title>: the text a browser shows on hover. */
function tooltip(text: string): SVGTitleElement {
  const title = svg("title", {});
  title.textContent = text;
  return title;
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
