// The level editor's draft (M4.2): a level being made, as the editor holds it.
//
// A draft is plain data. `draftToLevelInfo` turns it into what the board draws, straight away and
// with no rules: whether the level is *valid* is only ever the engine's say (levelData.ts exports the
// draft to the level format, and the `loadLevel` request checks it). Anything the editor doesn't edit
// (hints, constraints, par, objectives, other boards...) waits in `extra`, written back as it was.
import type { Clock, Enemy, Facing, LevelInfo, Pos, TileKind } from "../py/protocol";

/** One square: its tile, and the details some tiles take (the engine's `TILE_DETAILS`). */
export interface Cell {
  tile: TileKind;
  text?: string; // a sign's words, or a rune's
  passphrase?: string; // a gate's answer
  question?: string; // what a gate asks
  every?: number; // a timed gate: opens and shuts every this many ticks...
  open?: number; // ...and is open for this many of them
  clock?: Clock; // a timed gate's clock
  symbol?: string; // the legend symbol this square had in the file it came from, kept where it can be
}

/** An enemy as the file says it: a key is there only if the file has it, so nothing is "fixed" silently. */
export interface DraftEnemy {
  kind: Enemy["kind"];
  start: Pos;
  route?: Pos[]; // a patrol's corners
  loop?: boolean;
  clock?: Clock;
  armoured?: boolean;
  strategy?: string;
}

export interface Draft {
  id: string; // "my-<random>", unique in this browser
  title: string;
  brief: string;
  trains: string;
  piece: string;
  width: number;
  height: number;
  cells: Cell[][]; // cells[y][x]; y = 0 is the bottom rank, as in the engine
  start: Pos;
  facing: Facing;
  planks: number; // planks the piece starts with
  goal: Pos | null;
  spots: Pos[]; // squares a hidden goal might be on (drawn as ?), instead of a goal
  enemies: DraftEnemy[];
  api: string[]; // the abilities the piece has
  extra: Record<string, unknown>; // the level file's other keys, kept as they were (including its `legend`)
}

export const DETAIL_KEYS = ["text", "passphrase", "question", "every", "open", "clock"] as const;

export const floorCell = (): Cell => ({ tile: "floor" });

/** A name for a new level: "my-" and eight random letters and digits. */
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `my-${Array.from(bytes, (b) => (b % 36).toString(36)).join("")}`;
}

/** A blank board: start at the bottom left, goal at the top right. */
export function blankDraft(width = 8, height = 8, id = newId()): Draft {
  return {
    id,
    title: "Untitled level",
    brief: "",
    trains: "",
    piece: "pawn",
    width,
    height,
    cells: Array.from({ length: height }, () => Array.from({ length: width }, floorCell)),
    start: [0, 0],
    facing: "north",
    planks: 0,
    goal: [width - 1, height - 1],
    spots: [],
    enemies: [],
    api: ["move", "turn_left", "turn_right"],
    extra: {},
  };
}

/** A square's chess name: [1, 3] is "b4". */
export const squareName = ([x, y]: Pos): string => `${String.fromCharCode(97 + x)}${y + 1}`;

/** A square from its chess name, or null when it isn't one. */
export function parseSquare(name: unknown): Pos | null {
  const match = typeof name === "string" ? /^([a-z])([1-9]\d*)$/.exec(name) : null;
  return match ? [match[1]!.charCodeAt(0) - 97, Number(match[2]) - 1] : null;
}

/** Squares in the order the engine lists them: by file, then rank. */
const byFileThenRank = (a: Pos, b: Pos): number => a[0] - b[0] || a[1] - b[1];

/** The parts of `LevelInfo` a bare board has no use for: no objectives, limits, par, hints or other boards. */
export const NO_RULES = {
  objectives: { reach_goal: true, say: [], waypoints: false, collect: null, capture: null },
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
} satisfies Partial<LevelInfo>;

/** What the board draws, with the rest of `LevelInfo` left empty (the engine fills that in once the level is valid). */
export function draftToLevelInfo(draft: Draft): LevelInfo {
  const { width, height, cells } = draft;
  const at = (cell: Cell, x: number, y: number) => ({ cell, pos: [x, y] as Pos });
  // the engine lists texts in the order it reads the map: the top rank first, each rank from the left
  const squares = Array.from({ length: height }, (_, i) => height - 1 - i).flatMap((y) => cells[y]!.map((cell, x) => at(cell, x, y)));
  const timed = squares.filter(({ cell }) => cell.tile === "timed_gate");
  const timedGates = timed.map(({ cell, pos }) => ({
    pos,
    every: cell.every ?? 0,
    open: cell.open ?? 2,
    clock: cell.clock ?? "action",
    text: `A timed gate: open for ${cell.open ?? 2} of every ${cell.every ?? 0} ticks.`,
  }));
  return {
    id: draft.id,
    chapter: 0,
    title: draft.title,
    trains: draft.trains,
    brief: draft.brief,
    piece: draft.piece,
    width,
    height,
    tiles: cells.map((row) => row.map((cell) => cell.tile)),
    signs: squares.filter(({ cell }) => cell.tile === "sign").map(({ cell, pos }) => ({ pos, text: cell.text ?? "" })),
    runes: squares.filter(({ cell }) => cell.tile === "rune").map(({ cell, pos }) => ({ pos, text: cell.text ?? "" })),
    questions: squares.filter(({ cell }) => cell.tile === "gate" && cell.question !== undefined).map(({ cell, pos }) => ({ pos, text: cell.question! })),
    timed_gates: timedGates,
    enemies: draft.enemies.map((enemy) => ({
      kind: enemy.kind,
      route: enemy.route?.length ? enemy.route : [enemy.start],
      loop: enemy.loop ?? false,
      clock: enemy.clock ?? "action",
      armoured: enemy.armoured ?? false,
    })),
    goal: draft.goal,
    goal_spots: [...draft.spots].sort(byFileThenRank),
    case_title: "",
    start: {
      pos: draft.start,
      facing: draft.facing,
      opened: timed.map(({ pos }) => pos).sort(byFileThenRank), // a timed gate starts open
      crossed: [],
      collected: [],
      planks: draft.planks,
      bridged: [],
      enemies: draft.enemies.map((enemy) => enemy.start),
      tick: 0,
      lost: null,
    },
    api: draft.api,
    ...NO_RULES,
  };
}
