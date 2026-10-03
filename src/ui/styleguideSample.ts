// The sample level of the style guide (#/styleguide, src/ui/styleguide.ts): one board that holds
// every Pawn-tier tile, every enemy kind, a patrol's route, and the squares a rook and a bishop attack.
// It is a hand-built LevelInfo, so the real BoardView draws it.
import type { Enemy, GameEvent, LevelInfo, Pos, TileKind, WorldState } from "../py/protocol";

// Top rank first. . floor  # wall  s sign  g guarded gate  t timed gate  o pit
// O pit that gets bridged  p plank  w waypoint  m gem  r rune
const MAP = [
  "#...r...s.", // y 7
  "#.##..w...", // y 6
  "......m..t", // y 5
  ".o..p..g..", // y 4
  "..........", // y 3
  ".O.#......", // y 2
  "..........", // y 1
  "..........", // y 0
];

const KINDS: Record<string, TileKind> = {
  ".": "floor",
  "#": "wall",
  s: "sign",
  g: "gate",
  t: "timed_gate",
  o: "pit",
  O: "pit",
  p: "plank",
  w: "waypoint",
  m: "gem",
  r: "rune",
};

const W = 10;
const H = MAP.length;

const tiles = MAP.map((row) => [...row].map((c) => KINDS[c] ?? "floor")).reverse();

/** Every square with this tile character, as board positions (y = 0 is the bottom rank). */
const where = (char: string): Pos[] =>
  MAP.flatMap((row, i) => [...row].flatMap((c, x): Pos[] => (c === char ? [[x, H - 1 - i]] : [])));

const GATE: Pos = where("g")[0]!;
const TIMED: Pos = where("t")[0]!;
const WAYPOINT: Pos = where("w")[0]!;
const GEM: Pos = where("m")[0]!;
const PLANK: Pos = where("p")[0]!;
const BRIDGED: Pos = where("O")[0]!;
const RUNE: Pos = where("r")[0]!;

const ROOK: Pos = [6, 3];
const BISHOP: Pos = [8, 0];
const CHASER: Pos = [1, 5];

/** The squares the rook and the bishop attack (a simplified sample, not the engine's rules). */
const ATTACKED: Pos[] = [
  ...Array.from({ length: W }, (_, x): Pos => [x, 3]).filter(([x]) => x !== ROOK[0]),
  ...Array.from({ length: H }, (_, y): Pos => [6, y]).filter(([, y]) => y !== ROOK[1]),
  [7, 1],
  [6, 2],
  [9, 1],
  [5, 3],
  [4, 4],
  [3, 5],
];

const enemies: Enemy[] = [
  { kind: "rook", route: [ROOK], loop: false, clock: "action", armoured: false },
  { kind: "bishop", route: [BISHOP], loop: false, clock: "action", armoured: false },
  { kind: "chaser", route: [CHASER, [4, 5]], loop: false, clock: "action", armoured: false },
];

const START: WorldState = {
  pos: [0, 0],
  facing: "north",
  opened: [],
  crossed: [],
  collected: [],
  planks: 0,
  bridged: [],
  enemies: [ROOK, BISHOP, CHASER],
  tick: 0,
  lost: null,
  clock_ticks: undefined,
  attacked: ATTACKED,
};

export const LEVEL = {
  id: "style-tile",
  chapter: 0,
  title: "Style tile",
  trains: "",
  brief: "",
  piece: "pawn",
  width: W,
  height: H,
  tiles,
  signs: where("s").map((pos) => ({ pos, text: "A signpost. Walk up to it to read it." })),
  runes: [{ pos: RUNE, text: "north" }],
  questions: [{ pos: GATE, text: "Which way?" }],
  timed_gates: [{ pos: TIMED, every: 3, open: 2, clock: "action", text: "A timed gate: open for 2 of every 3 ticks." }],
  enemies,
  goal: [9, 7],
  goal_spots: [
    [8, 6],
    [9, 6],
    [9, 7],
  ],
  case_title: "",
  start: START,
  objectives: { reach_goal: true, say: [], waypoints: false, collect: null, capture: null },
  api: [],
  constraints: { max_lines: null, min_comments: 0, require_nodes: [], ban_nodes: [], max_numbers: null },
  par: { lines: null },
  starter: "",
  goals: [],
  rules: [],
  obstacles: [],
  stars: [],
  hints: [],
  mastery: false,
  boards: [],
} satisfies LevelInfo;

/** The states the buttons jump to. Each starts from START. */
export const STATES: Record<string, Partial<WorldState>> = {
  start: {},
  "gates open": { opened: [GATE, TIMED] },
  "waypoint crossed": { crossed: [WAYPOINT] },
  "gem and plank taken": { collected: [GEM, PLANK] },
  "pit bridged": { bridged: [BRIDGED], collected: [PLANK] },
  "enemy captured": { enemies: [null, BISHOP, CHASER] },
  "run lost": { lost: [1, 5], pos: [1, 4], enemies: [ROOK, BISHOP, [1, 5]] },
};

export const state = (name: string): WorldState => ({ ...START, ...STATES[name] });

/** Events the buttons play: a walk with a turn (a trail and a turn), a bump, a refused guard, a rune read, and the rook taking the piece. */
export const EVENTS: Record<string, GameEvent[]> = {
  walk: [
    { kind: "move", state: { ...START, pos: [0, 2] } },
    { kind: "turn", state: { ...START, pos: [0, 2], facing: "east" } },
    { kind: "move", state: { ...START, pos: [3, 2], facing: "east" } },
  ],
  strike: [
    { kind: "move", state: { ...START, pos: [0, 3], facing: "east" } },
    { kind: "lost", state: { ...START, pos: [4, 3], facing: "east", lost: [4, 3] }, at: [4, 3], by: ROOK, message: "The rook on g4 took your pawn on e4." },
  ],
  bump: [{ kind: "bump", state: { ...START, pos: [1, 3] }, at: [1, 4] }],
  refuse: [{ kind: "guard", state: { ...START, pos: [7, 3] }, at: GATE, message: "No." }],
  read: [{ kind: "read", state: { ...START, pos: RUNE }, at: RUNE }],
};
