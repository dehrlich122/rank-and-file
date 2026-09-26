// Playback of a recorded run: play, pause, step, rewind, scrub.
//
// A run is recorded once (by the engine) and then replayed here, so moving
// backwards never re-runs any code. Frame 0 is the moment before the program
// starts; frame k is the moment after step k (the k-th line that ran).
import type { LevelResult, Step, WorldState } from "../py/protocol";

export interface Frame {
  step: Step | null; // null for frame 0
  state: WorldState; // the world after this frame
  output: string; // everything printed up to and including this frame
  // The console, shared by every frame of a run (printed output and game
  // messages, in order); this frame shows its first `logLength` entries.
  // Sharing one array keeps long print-heavy runs from copying it per step.
  log: readonly LogEntry[];
  logLength: number;
}

/** One console entry: something the program printed, or something the game said. */
export interface LogEntry {
  kind: "out" | "game";
  text: string;
}

export function buildFrames(result: Pick<LevelResult, "start" | "steps">): Frame[] {
  const log: LogEntry[] = [];
  const frames: Frame[] = [{ step: null, state: result.start, output: "", log, logLength: 0 }];
  let state = result.start;
  let output = "";
  for (const step of result.steps) {
    for (const event of step.events) state = event.state;
    output += step.output;
    // A guard's reply is caused by the line just printed, so it comes after it.
    if (step.output) log.push({ kind: "out", text: step.output });
    for (const event of step.events) {
      if (event.message) log.push({ kind: "game", text: event.message });
    }
    frames.push({ step, state, output, log, logLength: log.length });
  }
  return frames;
}

/** The console as it stands at `frame`. */
export function consoleAt(frame: Frame): LogEntry[] {
  return frame.log.slice(0, frame.logLength);
}

// -- which playback buttons can be used (QA-005) ---------------------------------------

export interface ControlInput {
  loaded: boolean; // the level is ready to run
  running: boolean; // Python is running the code right now
  recording: { index: number; last: number; playing: boolean } | null; // null: no run of the current code
  failed: boolean; // the recording ends in an error
}

/** Which buttons are enabled (true), and what Play and Jump are called. */
export interface ControlState {
  toStart: boolean;
  back: boolean;
  play: boolean;
  forward: boolean;
  toEnd: boolean;
  playing: boolean;
  playTitle: string;
  toEndTitle: string;
}

/**
 * The left arrows need a recording to move through. Play and the right arrows
 * always work: without a recording of the current code they run it first.
 */
export function controlStates({ loaded, running, recording, failed }: ControlInput): ControlState {
  const idle = loaded && !running;
  if (!recording) {
    return {
      toStart: false,
      back: false,
      play: idle,
      forward: idle,
      toEnd: idle,
      playing: false,
      playTitle: "Play",
      toEndTitle: "Jump to the outcome",
    };
  }
  const atStart = recording.index === 0;
  const atEnd = recording.index === recording.last;
  return {
    toStart: idle && !atStart,
    back: idle && !atStart,
    play: idle,
    forward: idle && !atEnd,
    toEnd: idle && !atEnd,
    playing: recording.playing,
    playTitle: recording.playing ? "Pause" : atEnd ? "Replay" : "Play",
    toEndTitle: failed ? "Jump to the error" : "Jump to the outcome",
  };
}

export const BASE_STEP_MS = 420;

/** How long a frame's animation takes: longer when a line does several things. */
export function frameDuration(frame: Frame, speed: number): number {
  const events = frame.step?.events.length ?? 0;
  return (BASE_STEP_MS * Math.max(1, events * 0.75)) / speed;
}

interface RenderOptions {
  animate: boolean; // play this frame's events, or jump straight to it
  durationMs: number;
}

export type Render = (frame: Frame, index: number, options: RenderOptions) => void;

export class Player {
  index = 0;
  playing = false;
  speed = 1;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly frames: Frame[],
    private readonly render: Render,
    private readonly onChange: () => void = () => {},
    speed = 1,
  ) {
    this.speed = speed;
    this.render(frames[0]!, 0, { animate: false, durationMs: 0 });
  }

  get last(): number {
    return this.frames.length - 1;
  }

  get atEnd(): boolean {
    return this.index === this.last;
  }

  play(): void {
    if (this.atEnd) this.go(0, false);
    this.playing = true;
    this.onChange();
    this.scheduleNext(this.index === 0 ? 200 : 0);
  }

  pause(): void {
    this.playing = false;
    this.clearTimer();
    this.onChange();
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  next(): void {
    this.pause();
    if (!this.atEnd) this.go(this.index + 1, true);
  }

  previous(): void {
    this.pause();
    if (this.index > 0) this.go(this.index - 1, false);
  }

  seek(index: number): void {
    this.pause();
    this.go(Math.max(0, Math.min(this.last, index)), false);
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    this.onChange();
  }

  dispose(): void {
    this.clearTimer();
  }

  private go(index: number, animate: boolean): void {
    this.index = index;
    const frame = this.frames[index]!;
    this.render(frame, index, { animate, durationMs: frameDuration(frame, this.speed) });
    this.onChange();
  }

  private scheduleNext(delay: number): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      if (!this.playing) return;
      if (this.index + 1 >= this.last) this.playing = false; // the next frame is the final one
      if (!this.atEnd) this.go(this.index + 1, true);
      if (this.playing) this.scheduleNext(frameDuration(this.frames[this.index]!, this.speed));
      else this.onChange();
    }, delay);
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
