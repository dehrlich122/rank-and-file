// The board, drawn as SVG: squares, tiles (walls, signposts, gates, pits,
// waypoints, gems, timed gates, planks), the goal, the enemies and their
// routes (M3.1), the squares chess pieces attack (M3.4) and the piece.
//
// The board never decides anything. It draws the states the engine reported:
// `show()` jumps straight to a state, `animate()` plays a step's events in order.
//
// Each tile type has its own draw function (TILE_ART below) and CSS classes, and
// every colour comes from the CSS custom properties in styles.css, so a visual
// redesign can reskin tiles without touching the logic. What each tile, enemy and
// the hero look like is in ./sprites (the registry there maps a kind to its drawing).
import type { Clock, Enemy, Facing, GameEvent, LevelInfo, Pos, TileKind, WorldState } from "../py/protocol";
import { halftone, litGrid, M, S } from "./sprites/floor";
import { ENEMY_SPRITE, enemy as enemySprite, goal as goalSprite, hero, TILE_SPRITE, tile as tileSprite, type Skin, type TileName } from "./sprites";
import { svg } from "./sprites/svg";

let trails = 0; // numbers each trail's gradient

export function squareName([x, y]: Pos): string {
  return `${String.fromCharCode(97 + x)}${y + 1}`;
}

export class BoardView {
  readonly element: SVGSVGElement;
  private readonly piece: SVGGElement; // moves between squares
  private readonly body: SVGGElement; // shakes on a bump
  private readonly pawn: SVGGElement; // the hero, redrawn when the facing changes
  private readonly flash: SVGRectElement;
  private readonly lostMark: SVGGElement; // where the run was lost (M3.1)
  private readonly enemies: SVGGElement[]; // one per level.enemies, moved like the piece
  private attackedKey: string | undefined;
  private readonly trails: SVGGElement; // fading streaks behind a move: the piece's, and the enemies' (M3.7)
  private last: WorldState | undefined; // the state before this one, to see what moved
  private readonly attacks: SVGGElement; // the squares enemy chess pieces attack, shaded (M3.4)
  private readonly counters: SVGGElement[]; // badges that count a clock's ticks: clockwork's (QA-021), timed gates' (M3.2)
  private readonly art = new Map<TileKind, Map<string, SVGGElement>>(); // tile kind -> "x,y" -> its art
  private readonly heroes = new Map<Facing, SVGElement>(); // the hero drawn facing each way, made when first needed
  private facing: Facing | undefined;
  private skin: Skin;
  private readonly stopHalftone: () => void;
  private timers: number[] = [];

  /**
   * `spots`: after a run with a hidden goal, whether the code reached it with
   * the goal on each ? square, by square name ("b3"). Without it they show ?.
   */
  constructor(
    private readonly level: LevelInfo,
    private readonly options: { mini?: boolean; spots?: ReadonlyMap<string, boolean>; skin?: Skin } = {},
  ) {
    this.skin = options.skin ?? "pawn";
    const { width, height } = level;
    this.element = svg("svg", {
      class: this.options.mini ? "board board-mini" : "board",
      viewBox: `0 0 ${M + width * S} ${height * S + M}`,
      role: "img",
      "aria-label": `${width} by ${height} board`,
    });

    this.stopHalftone = halftone(this.element);
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
    this.element.append(squares, litGrid(width, height), labels(width, height));

    // A hidden goal (M2): a mark on every square it might be on, except the
    // one where it is in the case being shown (that one gets the flag).
    for (const pos of level.goal_spots) {
      if (level.goal && squareName(pos) === squareName(level.goal)) continue;
      const [left, top] = corner(pos, height);
      squares.append(spot(left, top, this.options.spots?.get(squareName(pos))));
    }
    if (level.goal) {
      const [left, top] = corner(level.goal, height);
      squares.append(flag(left, top));
    }

    // Enemies (M3.1): every patrol's route, dotted, and the enemies themselves, under the piece.
    for (const enemy of level.enemies) if (enemy.route.length > 1) squares.append(route(enemy, height));
    this.enemies = level.enemies.map((enemy, i) => enemyPiece(enemy, level, i));

    this.attacks = svg("g", { class: "attacks", "aria-hidden": "true" });
    this.flash = svg("rect", { class: "bump-flash", width: S, height: S, x: 0, y: 0 });
    this.trails = svg("g", { class: "trails", "aria-hidden": "true" });
    this.element.append(this.attacks, this.trails, this.flash, ...this.enemies);

    this.piece = svg("g", { class: "piece" });
    this.body = svg("g", { class: "piece-body" });
    this.pawn = svg("g", { class: "pawn" });
    this.body.append(svg("circle", { r: 26, class: "cheer-ring" }), this.pawn);
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
    const moving = [this.piece, ...this.enemies];
    for (const element of moving) element.style.transition = "none";
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
    this.place(event.state, true);
    if (event.kind === "lost" && event.by && event.at) this.strike(event.by, event.at);
    if (event.kind === "bump" && event.at) this.bump(event.state.pos, event.at);
    if (event.kind === "guard" && event.at) {
      const gate = this.art.get("gate")?.get(`${event.at[0]},${event.at[1]}`);
      if (gate) restartAnimation(gate, "refusing");
    }
    if (event.kind === "read" && event.at) {
      const rune = this.art.get("rune")?.get(`${event.at[0]},${event.at[1]}`);
      if (rune) restartAnimation(rune, "reading");
    }
  }

  /** `animate`: a step of the replay, so a move leaves a trail and a turn plays; a jump to a state does neither. */
  private place(state: WorldState, animate = false): void {
    const before = this.last;
    this.last = state;
    this.piece.style.transform = centre(state.pos, this.level.height);
    if (state.facing !== this.facing) {
      const turned = this.facing !== undefined;
      this.facing = state.facing;
      this.pawn.replaceChildren(this.heroArt(state.facing));
      if (animate && turned) restartAnimation(this.pawn, "turning");
    }
    if (animate && before) {
      if (before.pos[0] !== state.pos[0] || before.pos[1] !== state.pos[1]) this.trail(before.pos, state.pos, "trail-hero");
      state.enemies?.forEach((pos, i) => {
        const was = before.enemies?.[i];
        if (pos && was && (pos[0] !== was[0] || pos[1] !== was[1])) this.trail(was, pos, "trail-foe");
      });
    }
    this.mark("gate", "open", state.opened);
    this.mark("timed_gate", "open", state.opened);
    this.mark("waypoint", "crossed", state.crossed);
    this.mark("gem", "collected", state.collected);
    this.mark("plank", "collected", state.collected);
    this.mark("pit", "bridged", state.bridged);
    // The shaded squares only change when a piece is taken, so skip the rebuild otherwise.
    const attackedKey = state.attacked?.join(";");
    if (state.attacked && attackedKey !== this.attackedKey) {
      this.attackedKey = attackedKey;
      this.attacks.replaceChildren(
        ...state.attacked.map((pos) => {
          const [left, top] = corner(pos, this.level.height);
          return svg("rect", { x: left, y: top, width: S, height: S, class: "attacked" });
        }),
      );
    }
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

  /**
   * A comet tail behind a moving piece: it is drawn out from the square the piece left at the pace the
   * piece slides, so its head is always the piece, then it fades (it lasts a little longer than the step).
   */
  private trail(from: Pos, to: Pos, className: string): void {
    const [a, b] = [from, to].map((pos) => corner(pos, this.level.height).map((n) => n + S / 2));
    const id = `trail-${++trails}`;
    const [x1, y1, x2, y2] = [a![0]!, a![1]!, b![0]!, b![1]!];
    const group = svg(
      "g",
      { class: className },
      svg("linearGradient", { id, gradientUnits: "userSpaceOnUse", x1, y1, x2, y2 }, svg("stop", { offset: "0%", class: "trail-tail" }), svg("stop", { offset: "100%", class: "trail-head" })),
      svg("line", { x1, y1, x2, y2, pathLength: 1, stroke: `url(#${id})` }),
    );
    this.trails.append(group);
    this.timers.push(window.setTimeout(() => group.remove(), 1500));
  }

  /** A chess piece takes the piece: it moves in from its own square (`by`) onto the square it took (`at`). */
  private strike(by: Pos, at: Pos): void {
    const index = this.last?.enemies?.findIndex((pos) => pos && pos[0] === by[0] && pos[1] === by[1]) ?? -1;
    const enemy = this.enemies[index];
    if (!enemy) return;
    // it takes the square, so it is drawn over the piece (and under the lost ring). Moving a node in the
    // document cancels its transitions, so reorder it first and let the browser see it there before it slides.
    this.lostMark.before(enemy);
    this.element.getBoundingClientRect();
    enemy.style.transform = centre(at, this.level.height);
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
    this.trails.replaceChildren();
  }

  dispose(): void {
    this.cancel();
    this.stopHalftone();
  }

  /** Draw the hero as another skin (Settings → Piece, step 3 of M3.7). */
  setSkin(skin: Skin): void {
    if (skin === this.skin) return;
    this.skin = skin;
    this.heroes.clear();
    if (this.facing) this.pawn.replaceChildren(this.heroArt(this.facing));
  }

  /** The hero turned to face `face`: the brackets and the model both show it. */
  private heroArt(face: Facing): SVGElement {
    let art = this.heroes.get(face);
    if (!art) {
      art = hero(this.skin, face);
      this.heroes.set(face, art);
    }
    return art;
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
  rune: (left, top, level, pos) => rune(left, top, find(level.runes, pos)?.text ?? ""),
};

/** A tile's sprite, centred on its square. */
function sprite(left: number, top: number, art: SVGElement): SVGGElement {
  return svg("g", { class: "spr", transform: `translate(${left + S / 2} ${top + S / 2})` }, art);
}

const tile = (left: number, top: number, name: TileName) => sprite(left, top, tileSprite(name));

function wall(left: number, top: number): SVGGElement {
  return svg("g", { class: "wall" }, tile(left, top, TILE_SPRITE.wall));
}

function signpost(left: number, top: number, text: string): SVGGElement {
  return svg("g", { class: "signpost" }, tooltip(text), tile(left, top, TILE_SPRITE.sign));
}

/** A rune (M3.6): a slab with a prompt on it, which the pawn reads by standing on it. Hover shows the text. */
function rune(left: number, top: number, text: string): SVGGElement {
  return svg(
    "g",
    { class: "rune" },
    tooltip(`A rune. Stand on it and use read() to get its text: "${text}"`),
    tile(left, top, TILE_SPRITE.rune),
    svg("rect", { x: left + 8, y: top + 18, width: S - 16, height: S - 30, class: "rune-flash" }),
    svg("rect", { x: left + 10, y: top + 24, width: S - 20, height: 2.5, class: "rune-scan" }),
  );
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
  group.append(
    tooltip(text),
    sprite(left, top, svg("g", {}, svg("g", { class: "spr-closed" }, tileSprite(TILE_SPRITE[timed ? "timed_gate" : "gate"])), svg("g", { class: "spr-open" }, tileSprite("gateOpen")))),
    svg("rect", { x: left + 4, y: top + 4, width: S - 8, height: S - 8, class: "gate-flash" }),
  );
  if (label) group.append(badge(left + S / 2, top + S - 16, label, clock));
  return group;
}

/** A plank (QA-017), lying on the floor or laid over a pit (`className` "pit-plank"). */
function plank(left: number, top: number, className: string, text: string): SVGGElement {
  return svg("g", { class: className }, tooltip(text), tile(left, top, TILE_SPRITE.plank));
}

/** A pit (M3.1): stepping in loses the run. The `bridged` class shows a plank laid over it (QA-017). */
function pit(left: number, top: number): SVGGElement {
  return svg("g", { class: "pit" }, tooltip("A pit. Step in and the run is lost."), tile(left, top, TILE_SPRITE.pit), plank(left, top, "pit-plank", "A pit with a plank over it: safe to cross."));
}

/** A waypoint (M3.1): a diamond to pass over on the way to the goal; crossed, it turns green with a check. */
function waypoint(left: number, top: number): SVGGElement {
  const art = svg("g", {}, svg("g", { class: "spr-todo" }, tileSprite("waypoint")), svg("g", { class: "spr-done" }, tileSprite("waypointDone")));
  return svg("g", { class: "waypoint" }, tooltip("A waypoint. Pass over it on the way to the goal."), sprite(left, top, art));
}

/** A gem (M3.1): picked up by walking over it, so it vanishes once collected. */
function gem(left: number, top: number): SVGGElement {
  return svg("g", { class: "gem" }, tooltip("A gem. Walk over it to collect it."), tile(left, top, TILE_SPRITE.gem));
}

/** A patrol's route (M3.1): a dotted line through its corners, closed for a loop. */
function route(enemy: Enemy, height: number): SVGPathElement {
  const points = enemy.route.map((pos) => corner(pos, height).map((n) => n + S / 2).join(" "));
  return svg("path", { d: `M ${points.join(" L ")}${enemy.loop ? " Z" : ""}`, class: "route" });
}

// What a chess piece attacks, in words, for its tooltip (M3.4).
const CHESS_LINES: Partial<Record<Enemy["kind"], string>> = {
  rook: "It attacks along its rank and file.",
  bishop: "It attacks along its diagonals.",
};

/**
 * An enemy (M3.1), centred on (0, 0) and moved by `place()`: broken wire, each glitching
 * on its own beat (`index` staggers them). Its badges: a chaser's "chases", a gear for
 * clockwork (it keeps time with the code), and "armoured". Rooks and bishops are drawn as
 * chess pieces (M3.4).
 */
function enemyPiece(enemy: Enemy, level: LevelInfo, index: number): SVGGElement {
  const group = svg("g", { class: `enemy enemy-${enemy.kind}${enemy.armoured ? " armoured" : ""}` });
  const counted = counts(level, enemy.clock);
  const clock = counted ? ", keeping time with your code" : "";
  const lines = CHESS_LINES[enemy.kind];
  const title = tooltip(`A ${enemy.kind}${clock}${enemy.armoured ? ". It's armoured" : ""}.${lines ? ` ${lines}` : ""}`);
  group.append(title, enemySprite(ENEMY_SPRITE[enemy.kind], "live", index * 1.9));
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

/** The goal: the board's one beacon (see sprites). */
function flag(left: number, top: number): SVGGElement {
  return svg("g", { class: "goal" }, sprite(left, top, goalSprite()));
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
