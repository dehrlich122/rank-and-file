import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PieceState, Step } from "../py/protocol";
import { BASE_STEP_MS, buildFrames, frameDuration, Player, type Frame } from "./playback";

const start: PieceState = { pos: [0, 0], facing: "north" };

function step(line: number, pos: [number, number] | null, output = ""): Step {
  return {
    line,
    scope: "<module>",
    events: pos ? [{ kind: "move", state: { pos, facing: "north" } }] : [],
    output,
    vars: [],
  };
}

const steps = [step(1, [0, 1]), step(2, null, "hi\n"), step(3, [0, 2], "bye\n")];

describe("buildFrames", () => {
  it("starts before the first line and carries state and output forward", () => {
    const frames = buildFrames({ start, steps });
    expect(frames).toHaveLength(4);
    expect(frames[0]).toEqual({ step: null, state: start, output: "" });
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
        { kind: "move", state: { pos: [0, 1], facing: "north" } },
        { kind: "turn", state: { pos: [0, 1], facing: "east" } },
      ],
    };
    expect(buildFrames({ start, steps: [multi] })[1]!.state).toEqual({ pos: [0, 1], facing: "east" });
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

  it("collects events up to a frame", () => {
    expect(player.eventsUpTo(3).map((e) => e.state.pos)).toEqual([
      [0, 1],
      [0, 2],
    ]);
  });
});
