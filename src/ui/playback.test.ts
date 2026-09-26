import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Step, WorldState } from "../py/protocol";
import { BASE_STEP_MS, buildFrames, consoleAt, controlStates, frameDuration, Player, type Frame } from "./playback";

const start: WorldState = { pos: [0, 0], facing: "north", opened: [] };

function step(line: number, pos: [number, number] | null, output = ""): Step {
  return {
    line,
    scope: "<module>",
    events: pos ? [{ kind: "move", state: { pos, facing: "north", opened: [] } }] : [],
    output,
    vars: [],
  };
}

const steps = [step(1, [0, 1]), step(2, null, "hi\n"), step(3, [0, 2], "bye\n")];

describe("buildFrames", () => {
  it("starts before the first line and carries state and output forward", () => {
    const frames = buildFrames({ start, steps });
    expect(frames).toHaveLength(4);
    expect(frames[0]).toMatchObject({ step: null, state: start, output: "" });
    expect(consoleAt(frames[0]!)).toEqual([]);
    expect(frames[1]!.state.pos).toEqual([0, 1]);
    expect(frames[2]!.state.pos).toEqual([0, 1]); // printing doesn't move the pawn
    expect(frames[2]!.output).toBe("hi\n");
    expect(frames[3]!.state.pos).toEqual([0, 2]);
    expect(frames[3]!.output).toBe("hi\nbye\n");
  });

  it("uses the last event of a step with several", () => {
    const multi: Step = {
      ...step(1, null),
      events: [
        { kind: "move", state: { pos: [0, 1], facing: "north", opened: [] } },
        { kind: "turn", state: { pos: [0, 1], facing: "east", opened: [] } },
      ],
    };
    expect(buildFrames({ start, steps: [multi] })[1]!.state).toEqual({ pos: [0, 1], facing: "east", opened: [] });
  });

  it("puts a guard's reply in the console right after the line that caused it", () => {
    const said: Step = {
      ...step(2, null, "hello\n"),
      events: [{ kind: "guard", state: start, at: [0, 1], message: "The guard is not amused." }],
    };
    const frames = buildFrames({ start, steps: [step(1, null, "first\n"), said] });
    expect(consoleAt(frames[1]!)).toEqual([{ kind: "out", text: "first\n" }]); // earlier frames see less
    expect(consoleAt(frames[2]!)).toEqual([
      { kind: "out", text: "first\n" },
      { kind: "out", text: "hello\n" },
      { kind: "game", text: "The guard is not amused." },
    ]);
    expect(frames[2]!.output).toBe("first\nhello\n"); // the program's own output stays separate
  });

  it("keeps opened gates in the state", () => {
    const opened: Step = {
      ...step(1, null),
      events: [{ kind: "gate_open", state: { ...start, opened: [[1, 2]] }, at: [1, 2] }],
    };
    const frames = buildFrames({ start, steps: [opened, step(2, [0, 1])] });
    expect(frames[1]!.state.opened).toEqual([[1, 2]]);
  });
});

describe("controlStates", () => {
  const base = { loaded: true, running: false, failed: false };

  it("without a recording, Play and the right arrows run the code; the left arrows wait", () => {
    const state = controlStates({ ...base, recording: null });
    expect(state).toMatchObject({ toStart: false, back: false, play: true, forward: true, toEnd: true, playTitle: "Play" });
  });

  it("everything waits while the level loads or Python is running", () => {
    for (const input of [{ ...base, loaded: false }, { ...base, running: true }]) {
      const state = controlStates({ ...input, recording: null });
      expect([state.play, state.forward, state.toEnd]).toEqual([false, false, false]);
    }
  });

  it("mid-recording, every direction works", () => {
    const state = controlStates({ ...base, recording: { index: 3, last: 9, playing: false } });
    expect(state).toMatchObject({ toStart: true, back: true, play: true, forward: true, toEnd: true });
  });

  it("at the start the left arrows are off; at the end the right arrows are off and Play means Replay", () => {
    expect(controlStates({ ...base, recording: { index: 0, last: 9, playing: false } })).toMatchObject({ toStart: false, back: false });
    expect(controlStates({ ...base, recording: { index: 9, last: 9, playing: false } })).toMatchObject({
      forward: false,
      toEnd: false,
      playTitle: "Replay",
    });
  });

  it("names Pause while playing, and the error when the run failed", () => {
    expect(controlStates({ ...base, recording: { index: 2, last: 9, playing: true } }).playTitle).toBe("Pause");
    expect(controlStates({ ...base, failed: true, recording: { index: 2, last: 9, playing: false } }).toEndTitle).toBe("Jump to the error");
  });
});

describe("frameDuration", () => {
  it("is longer for lines that do more, and shorter when sped up", () => {
    const [, one] = buildFrames({ start, steps });
    const three: Frame = { ...one!, step: { ...one!.step!, events: [...one!.step!.events, ...one!.step!.events, ...one!.step!.events] } };
    expect(frameDuration(one!, 1)).toBe(BASE_STEP_MS);
    expect(frameDuration(three, 1)).toBeGreaterThan(BASE_STEP_MS);
    expect(frameDuration(one!, 2)).toBe(BASE_STEP_MS / 2);
  });
});

describe("Player", () => {
  let rendered: Array<{ index: number; animate: boolean }>;
  let player: Player;

  beforeEach(() => {
    vi.useFakeTimers();
    rendered = [];
    player = new Player(buildFrames({ start, steps }), (_frame, index, { animate }) => rendered.push({ index, animate }));
  });

  afterEach(() => {
    player.dispose();
    vi.useRealTimers();
  });

  it("renders the starting frame straight away", () => {
    expect(rendered).toEqual([{ index: 0, animate: false }]);
  });

  it("plays every frame in order, animating each, then stops", () => {
    player.play();
    vi.advanceTimersByTime(10_000);
    expect(rendered.map((r) => r.index)).toEqual([0, 1, 2, 3]);
    expect(rendered.slice(1).every((r) => r.animate)).toBe(true);
    expect(player.playing).toBe(false);
    expect(player.atEnd).toBe(true);
  });

  it("pauses mid-way", () => {
    player.play();
    vi.advanceTimersByTime(200 + 10); // first frame
    player.pause();
    vi.advanceTimersByTime(10_000);
    expect(player.index).toBe(1);
  });

  it("steps forward with animation and back without", () => {
    player.next();
    player.next();
    player.previous();
    expect(rendered.slice(1)).toEqual([
      { index: 1, animate: true },
      { index: 2, animate: true },
      { index: 1, animate: false },
    ]);
  });

  it("clamps seeking and restarts from the beginning when played at the end", () => {
    player.seek(99);
    expect(player.index).toBe(3);
    player.seek(-5);
    expect(player.index).toBe(0);
    player.seek(3);
    player.play();
    expect(player.index).toBe(0);
  });

});
