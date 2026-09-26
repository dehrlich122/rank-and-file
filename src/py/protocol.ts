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
export type TileKind = "floor" | "wall" | "sign" | "gate" | "pit" | "waypoint" | "gem" | "timed_gate";
export type Clock = "action" | "line" | "new_line";

/** The world at one moment: where the piece is, which gates are open, and the obstacles (M3.1). */
export interface WorldState {
  pos: Pos;
  facing: Facing;
  opened: Pos[];
  crossed: Pos[]; // waypoints passed over
  collected: Pos[]; // gems picked up
  tick: number; // ticks of the action clock so far (moves, turns and waits)
  lost: Pos | null; // where the run was lost: a pit, or where the piece was caught
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
  questions: Array<{ pos: Pos; text: string }>; // what the guard asks, at gates that ask (never the answer)
  timed_gates: Array<{ pos: Pos; every: number; clock: Clock }>; // open when the clock's ticks are a multiple of `every`
  goal: Pos | null;
  goal_spots: Pos[]; // a hidden goal: the squares it might be on (drawn as ?)
  case_title: string; // the title of the row of cases above the board; "" for a single case
  start: WorldState;
  objectives: { reach_goal: boolean; say: string[]; waypoints: boolean; collect: number | "all" | null };
  api: string[];
  constraints: { max_lines: number | null; min_comments: number; require_nodes: string[]; ban_nodes: string[] };
  par: { lines: number | null };
  starter: string;
  goals: string[]; // what to do, in words (never a passphrase)
  rules: string[]; // the level's constraints, in words
  obstacles: string[]; // each obstacle's rule, in words (M3.1)
  stars: string[]; // what each of the three stars asks for, in words
  hints: string[]; // tiered: nudge, concept reminder, partial example
}

type LoadLevelResult = { ok: true; level: LevelInfo } | { ok: false; error: string };

export interface GameEvent {
  kind: "move" | "turn" | "wait" | "bump" | "gate_open" | "guard" | "tick" | "lost";
  state: WorldState; // the whole world's state after the event
  at?: Pos; // bump: the square bumped into; gate_open/guard: the gate; lost: where
  message?: string; // guard: what the guard said; lost: what happened
  clock?: Clock; // tick: the clock that ticked
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

/** Every request the worker understands: its arguments and its result. */
export interface Requests {
  runSnippet: { args: { code: string }; result: SnippetResult };
  loadLevel: { args: { level: unknown }; result: LoadLevelResult };
  loadSandbox: { args: { api: string[] }; result: LevelInfo };
  runLevel: { args: { level: unknown; code: string; hintsUsed: number }; result: LevelResult };
  runSandbox: { args: { code: string; api: string[] }; result: LevelResult };
  replPush: { args: { line: string }; result: ReplResult };
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
