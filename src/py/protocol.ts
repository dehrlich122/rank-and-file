// The contract between the UI thread and the Python worker.
//
// Result shapes mirror the dataclasses in engine/rankfile/ (runner.py,
// levels.py, errors.py, repl.py), which the worker receives as JSON from
// engine/rankfile/bridge.py. Keep them in sync.

export interface ErrorInfo {
  type: string;
  message: string;
  friendly: string;
  line: number | null;
  traceback: string;
}

export interface SnippetResult {
  status: "ok" | "error" | "timeout";
  output: string;
  error: ErrorInfo | null;
  lines_run: number;
  duration_ms: number;
}

export type Facing = "north" | "east" | "south" | "west";
export type Pos = [number, number];
export type TileKind = "floor" | "wall" | "sign" | "gate" | "pit" | "waypoint" | "gem" | "timed_gate" | "plank" | "rune";
export type Clock = "action" | "line" | "new_line";

/** The world at one moment: where the piece is, which gates are open, and the obstacles (M3.1). */
export interface WorldState {
  pos: Pos;
  facing: Facing;
  opened: Pos[];
  crossed: Pos[]; // waypoints passed over
  collected: Pos[]; // gems and planks picked up
  planks: number; // planks the piece is carrying (QA-017)
  bridged: Pos[]; // pits with a plank over them
  enemies: Array<Pos | null>; // where each of the level's enemies is; null once captured or fallen into a pit
  tick: number; // ticks of the action clock so far (moves, turns and waits)
  lost: Pos | null; // where the run was lost: a pit, or where the piece was caught
  clock_ticks?: Partial<Record<Clock, number>>; // the code clocks' counts, on levels with clockwork (QA-021)
  attacked?: Pos[]; // the squares enemy chess pieces attack, on levels with any (M3.4)
}

/** A level as the engine describes it (levels.Level.describe). */
export interface LevelInfo {
  id: string;
  chapter: number;
  title: string;
  trains: string;
  brief: string;
  piece: string;
  width: number;
  height: number;
  tiles: TileKind[][]; // tiles[y][x]; y = 0 is the bottom rank
  signs: Array<{ pos: Pos; text: string }>;
  runes: Array<{ pos: Pos; text: string }>; // the text on each rune tile, which `pawn.read()` gives back (M3.6)
  questions: Array<{ pos: Pos; text: string }>; // what the guard asks, at gates that ask (never the answer)
  timed_gates: Array<{ pos: Pos; every: number; open: number; clock: Clock; text: string }>; // open for the first `open` ticks of every `every` (QA-024); text: its rule in words
  enemies: Enemy[]; // patrols and chasers; where they are is in each WorldState
  goal: Pos | null;
  goal_spots: Pos[]; // a hidden goal: the squares it might be on (drawn as ?)
  case_title: string; // a hidden goal's row of cases above the board: its title; "" otherwise
  start: WorldState;
  objectives: { reach_goal: boolean; say: string[]; waypoints: boolean; collect: number | "all" | null; capture: number | "all" | null };
  api: string[];
  constraints: {
    max_lines: number | null;
    min_comments: number;
    require_nodes: string[];
    ban_nodes: string[];
    max_numbers: number | null; // numbers the code may write (M3.2, QA-029); 1 means one number, written once
  };
  par: { lines: number | null };
  starter: string;
  goals: string[]; // what to do, in words (never a passphrase)
  rules: string[]; // the level's constraints, in words
  obstacles: string[]; // each obstacle's rule, in words (M3.1)
  stars: string[]; // what each of the three stars asks for, in words
  hints: string[]; // tiered: nudge, concept reminder, partial example
  mastery: boolean; // a chapter's optional mastery challenge (M3.2)
  boards: LevelInfo[]; // a level with other maps (M3.2): every board, first to last, the others shown small beside it (QA-032); otherwise empty
}

/** A patrol or a chaser (levels.Enemy), as the board draws it. */
export interface Enemy {
  kind: "patrol" | "chaser" | "rook" | "bishop"; // rooks and bishops stand still (M3.4)
  route: Pos[]; // a patrol's corners (one square if it stands guard)
  loop: boolean; // a patrol: round and round, instead of there and back
  clock: Clock;
  armoured: boolean;
}

/** Where a level problem belongs, for the editor (levels.LevelError.at): any of these. */
export interface ProblemAt {
  square?: string; // "c4"
  enemy?: number; // its number from 1, as in the message
  field?: string; // a key of the level: "title", "goal", "start", "api", "size", ...
  squares?: string[]; // several squares, e.g. every square using a legend entry that is wrong
}

type LoadLevelResult = { ok: true; level: LevelInfo } | { ok: false; error: string; at: ProblemAt | null };

/** What the level editor offers, read from the checker's own tables (levels.editor_options). */
export interface EditorOptions {
  max_side: number;
  pieces: Record<string, string[]>; // a piece's abilities
  tiles: Record<string, { needs: string[]; may: string[] }>; // the details each tile kind takes
  enemies: Record<string, string[]>; // the keys each enemy kind takes
  clocks: Clock[];
  facings: Facing[];
  timed_gate: { open: number; clock: Clock }; // a timed gate's defaults
}

export interface GameEvent {
  kind: "move" | "turn" | "wait" | "bump" | "gate_open" | "guard" | "capture" | "tick" | "lost" | "pick_up" | "bridge" | "fall" | "crush" | "read";
  state: WorldState; // the whole world's state after the event
  by?: number; // lost, when a chess piece took the piece: which enemy (its place in level.enemies)
  at?: Pos; // bump: the square bumped into; gate_open/guard: the gate; capture, fall: the enemy's square; bridge: the pit; pick_up, lost: where; read: the rune
  message?: string; // guard: what the guard said; pick_up, fall, crush, lost: what happened
}

export interface Var {
  name: string;
  value: string;
  type: string;
}

/** One line of player code that ran, and what it did. */
export interface Step {
  line: number;
  scope: string;
  events: GameEvent[];
  output: string;
  vars: Var[]; // the variables after the line ran
}

interface LintWarning {
  line: number;
  message: string;
}

type LevelStatus = "solved" | "incomplete" | "finished" | "lost" | "error" | "timeout" | "constraint";

/** One of a solved run's three stars (runner.Star). */
export interface Star {
  kind: "solved" | "par" | "no_hints";
  earned: boolean;
  label: string;
}

export interface LevelResult {
  status: LevelStatus;
  summary: string;
  start: WorldState;
  final: WorldState;
  steps: Step[];
  output: string;
  error: ErrorInfo | null;
  problems: string[];
  warnings: LintWarning[];
  lines_run: number;
  code_lines: number;
  truncated: boolean;
  stars: Star[]; // only for a solved run
  // A level with several cases (a hidden goal's ? squares, other maps): this
  // result is the verdict on the whole run, with no recording of its own;
  // `cases` holds each case's result and recording. `case` is the one to show
  // first (the first that failed). case_note: the run, how many cases it
  // worked for; a case, which one it is.
  cases: CaseResult[];
  case: number;
  case_note: string;
  duration_ms: number;
}

/** One case of a level (runner.run_level): its result, what to call it ("b3", "board 2") and its board. */
interface CaseResult extends LevelResult {
  label: string;
  level: LevelInfo;
}

interface ReplResult {
  more: boolean;
  output: string;
  error: ErrorInfo | null;
}

/** One entry of the Codex, the dictionary of functions the player knows (codex.Entry; docs/Codex.md). */
export interface CodexEntry {
  name: string; // as code writes it: "pawn.move", "print"
  kind: "ability" | "property" | "builtin" | "method"; // a property is used without parentheses (pawn.position); a method is called on text (str.upper, M3.6)
  calls: string[]; // how to use it: ["pawn.move(squares=1)"]; some built-ins have more than one form
  paragraphs: string[]; // what it does; `code` is in backticks
  args: Array<{ name: string; about: string }>;
  returns: string;
  example: string;
  introduced: string; // the id of the level that first unlocked or taught it
  new: boolean; // ...when that's this level
}

/** A chapter as the engine needs it to work out "taught so far" (codex.history): its levels' files and lessons. */
export interface CodexChapter {
  curriculum: boolean;
  levels: Array<{ id: string; data: unknown; lesson: string }>;
}

/** Every request the worker understands: its arguments and its result. */
export interface Requests {
  runSnippet: { args: { code: string }; result: SnippetResult };
  loadLevel: { args: { level: unknown }; result: LoadLevelResult };
  editorOptions: { args: Record<string, never>; result: EditorOptions };
  loadSandbox: { args: { api: string[]; board?: unknown }; result: LevelInfo }; // board: a level's lesson_board (QA-019)
  runLevel: { args: { level: unknown; code: string; hintsUsed: number; solutionSeen: boolean }; result: LevelResult };
  runSandbox: { args: { code: string; api: string[]; board?: unknown }; result: LevelResult };
  codex: { args: { levelId: string; chapters: CodexChapter[] }; result: CodexEntry[] }; // chapters: all of them, in play order
  // level: the one on screen, for the session's stand-in piece (Scratch Python has no board)
  replPush: { args: { line: string; level: { piece: string; api: string[] } | null }; result: ReplResult };
  replReset: { args: Record<string, never>; result: { ok: true } };
}

export type RequestKind = keyof Requests;

export interface WorkerRequest<K extends RequestKind = RequestKind> {
  id: number;
  kind: K;
  args: Requests[K]["args"];
}

export interface ReadyInfo {
  pythonVersion: string;
  loadMs: number;
}

export type WorkerMessage =
  | ({ kind: "ready" } & ReadyInfo)
  | { kind: "loadFailed"; message: string }
  | { kind: "response"; id: number; ok: true; result: unknown }
  | { kind: "response"; id: number; ok: false; message: string };
