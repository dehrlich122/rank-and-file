import { describe, expect, it } from "vitest";
import type { GameEvent, LevelResult, WorldState } from "../py/protocol";
import { landingSounds, outcomeSounds, soundsFor, soundsForStep, Voices } from "./events";

const state = (changes: Partial<WorldState> = {}): WorldState =>
  ({ pos: [0, 0], facing: "north", opened: [], crossed: [], collected: [], planks: 0, bridged: [], enemies: [], tick: 0, lost: null, ...changes }) as WorldState;
const event = (kind: GameEvent["kind"], changes: Partial<WorldState> = {}): GameEvent => ({ kind, state: state(changes) });

describe("soundsFor", () => {
  it("names a turn by its direction", () => {
    expect(soundsFor(event("turn", { facing: "east" }), state())).toEqual(["turn_right"]);
    expect(soundsFor(event("turn", { facing: "west" }), state())).toEqual(["turn_left"]);
    expect(soundsFor(event("turn", { facing: "north" }), state({ facing: "east" }))).toEqual(["turn_left"]);
    expect(soundsFor(event("turn", { facing: "north" }), state({ facing: "west" }))).toEqual(["turn_right"]);
  });

  it("adds a ping when a move crosses a waypoint", () => {
    expect(soundsFor(event("move", { crossed: [[1, 1]] }), state())).toEqual(["move", "waypoint"]);
    expect(soundsFor(event("move", { crossed: [[1, 1]] }), state({ crossed: [[1, 1]] }))).toEqual(["move"]);
  });

  it("gives each other event its own sound, and waiting and ticks none", () => {
    for (const kind of ["bump", "gate_open", "guard", "pick_up", "bridge", "capture", "read", "lost", "fall", "crush"] as const) {
      expect(soundsFor(event(kind), null)).toEqual([kind]);
    }
    expect(soundsFor(event("wait"), null)).toEqual([]);
    expect(soundsFor(event("tick"), null)).toEqual([]);
  });
});

describe("soundsForStep", () => {
  const walk = (n: number) => Array.from({ length: n }, () => event("move"));
  const sounding = (events: GameEvent[], speed: number) => soundsForStep(events, state(), speed).map((names) => names.length);

  it("plays every square at normal speed", () => {
    expect(sounding(walk(5), 1)).toEqual([1, 1, 1, 1, 1]);
    expect(sounding(walk(5), 0.5)).toEqual([1, 1, 1, 1, 1]);
  });

  it("plays every second square at 2×, and the last", () => {
    expect(sounding(walk(5), 2)).toEqual([1, 0, 1, 0, 1]);
    expect(sounding(walk(4), 2)).toEqual([1, 0, 1, 1]);
  });

  it("plays only the first and last of a run at 4×", () => {
    expect(sounding(walk(5), 4)).toEqual([1, 0, 0, 0, 1]);
    expect(sounding(walk(1), 4)).toEqual([1]);
  });

  it("never thins other events, and starts a new run after one", () => {
    const events = [...walk(3), event("bump"), ...walk(3)];
    expect(sounding(events, 4)).toEqual([1, 0, 1, 1, 1, 0, 1]);
  });

  it("keeps a waypoint's ping when its move is thinned", () => {
    const events = [event("move"), event("move", { crossed: [[1, 1]] }), event("move"), event("move")];
    expect(soundsForStep(events, state(), 4)[1]).toEqual(["waypoint"]);
  });
});

describe("jumps", () => {
  const jump = (changes: Partial<WorldState> = {}, took?: number): GameEvent => ({ ...event("jump", changes), from: [0, 0], via: [0, 2], ...(took === undefined ? {} : { took }) });

  it("takes off with a jump sound, whatever it lands on", () => {
    expect(soundsFor(jump(), state())).toEqual(["jump"]);
    expect(soundsFor(jump({ crossed: [[1, 1]] }, 0), state())).toEqual(["jump"]);
  });

  it("has no landing sound for a plain jump", () => {
    expect(landingSounds([jump()], state())).toEqual([[]]);
  });

  it("lands with a capture when it took an enemy, even the first", () => {
    expect(landingSounds([jump({}, 0)], state())).toEqual([["capture"]]);
    expect(landingSounds([jump({}, 2)], state())).toEqual([["capture"]]);
  });

  it("lands with a ping on a waypoint, comparing with the event before", () => {
    const crossed: WorldState["crossed"] = [[1, 1]];
    expect(landingSounds([jump({ crossed })], state())).toEqual([["waypoint"]]);
    expect(landingSounds([jump({ crossed }), jump({ crossed })], state())).toEqual([["waypoint"], []]);
    expect(landingSounds([jump({ crossed })], state({ crossed }))).toEqual([[]]);
  });

  it("lands with both when it took an enemy on a waypoint", () => {
    expect(landingSounds([jump({ crossed: [[1, 1]] }, 0)], state())).toEqual([["capture", "waypoint"]]);
  });

  it("leaves a lost event's sound as it is, with no landing sound", () => {
    const events = [jump({}, 0), event("lost")];
    expect(soundsForStep(events, state(), 1)).toEqual([["jump"], ["lost"]]);
    expect(landingSounds(events, state())[1]).toEqual([]);
  });

  it("never thins jumps at 4×", () => {
    expect(soundsForStep([jump(), jump(), jump()], state(), 4)).toEqual([["jump"], ["jump"], ["jump"]]);
  });

  it("has no landing sounds for a move", () => {
    expect(landingSounds([event("move", { crossed: [[1, 1]] })], state())).toEqual([[]]);
  });
});

describe("outcomeSounds", () => {
  const result = (status: LevelResult["status"], earned = 0): LevelResult =>
    ({ status, stars: [0, 1, 2].map((i) => ({ kind: "solved", earned: i < earned, label: "" })) }) as LevelResult;

  it("sounds a solve, then a star for each earned", () => {
    expect(outcomeSounds(result("solved", 2)).map((o) => o.sound)).toEqual(["complete", "star", "star"]);
    expect(outcomeSounds(result("solved", 3))).toHaveLength(4);
  });

  it("sounds a loss and every kind of error, and nothing for an unfinished run", () => {
    expect(outcomeSounds(result("lost")).map((o) => o.sound)).toEqual(["run_lost"]);
    for (const status of ["error", "timeout", "constraint"] as const) expect(outcomeSounds(result(status)).map((o) => o.sound)).toEqual(["error"]);
    expect(outcomeSounds(result("incomplete"))).toEqual([]);
  });
});

describe("Voices", () => {
  it("allows four sounds at once and drops the fifth", () => {
    const voices = new Voices(4);
    expect([1, 2, 3, 4, 5].map(() => voices.start(0, 1))).toEqual([true, true, true, true, false]);
  });

  it("makes room as sounds end", () => {
    const voices = new Voices(1);
    expect(voices.start(0, 0.5)).toBe(true);
    expect(voices.start(0.2, 0.5)).toBe(false);
    expect(voices.start(0.5, 0.5)).toBe(true);
  });
});
