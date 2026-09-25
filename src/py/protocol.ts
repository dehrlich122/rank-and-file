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
export type TileKind = "floor" | "wall" | "sign";

export interface PieceState {
  pos: Pos;
  facing: Facing;
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
  goal: Pos | null;
  start: PieceState;
  objectives: { reach_goal: boolean; say: string[] };
  api: string[];
  constraints: { max_lines: number | null; min_comments: number; require_nodes: string[]; ban_nodes: string[] };
  par: Record<string, number>;
  starter: string;
}

export type LoadLevelResult = { ok: true; level: LevelInfo } | { ok: false; error: string };

export interface GameEvent {
  kind: "move" | "turn" | "bump";
  state: PieceState; // the piece's state after the event
  at?: Pos; // for bumps: the square it bumped into
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

export interface LintWarning {
  line: number;
  message: string;
}

export type LevelStatus = "solved" | "incomplete" | "finished" | "error" | "timeout" | "constraint";

export interface LevelResult {
  status: LevelStatus;
  summary: string;
  start: PieceState;
  final: PieceState;
  steps: Step[];
  output: string;
  error: ErrorInfo | null;
  problems: string[];
  warnings: LintWarning[];
  lines_run: number;
  code_lines: number;
  truncated: boolean;
  duration_ms: number;
}

export interface ReplResult {
  more: boolean;
  output: string;
  error: ErrorInfo | null;
}

/** Every request the worker understands: its arguments and its result. */
export interface Requests {
  runSnippet: { args: { code: string }; result: SnippetResult };
  loadLevel: { args: { level: unknown }; result: LoadLevelResult };
  loadSandbox: { args: { api: string[] }; result: LevelInfo };
  runLevel: { args: { level: unknown; code: string }; result: LevelResult };
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
