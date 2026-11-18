import { describe, expect, it } from "vitest";
import type { Facing, GameEvent, Pos, WorldState } from "../py/protocol";
import { jumpPlan, playableEvents } from "./motion";

const at = (x: number, facing: Facing = "east"): WorldState => ({ pos: [x, 0], facing, opened: [], crossed: [], collected: [], planks: 0, bridged: [], enemies: [], tick: 0, lost: null, attacked: [] });
const move = (x: number, facing?: Facing): GameEvent => ({ kind: "move", state: at(x, facing) });
const turn = (x: number, facing: Facing): GameEvent => ({ kind: "turn", state: at(x, facing) });

describe("playableEvents", () => {
  const walk = [move(1), move(2), move(3)];

  it("keeps a pawn's steps as separate hops", () => {
    expect(playableEvents(walk, "pawn")).toEqual(walk);
  });

  it("makes another piece's run of moves one slide to where it ends", () => {
    expect(playableEvents(walk, "rook")).toEqual([move(3)]);
  });

  it("keeps a turn, and a stop for anything else, between two slides", () => {
    const events = [move(1), move(2), turn(2, "north"), move(3, "north"), { kind: "bump", state: at(3, "north"), at: [3, 1] } as GameEvent];
    expect(playableEvents(events, "rook").map((e) => e.kind)).toEqual(["move", "turn", "move", "bump"]);
    expect(playableEvents(events, "rook")[0]).toEqual(move(2));
  });
});

describe("playableEvents on a knight level", () => {
  const hop = (x: number, facing: Facing): GameEvent => ({ kind: "jump", from: [x - 2, 0], via: [x, 0], state: at(x, facing) });

  it("keeps two jumps in a row, even when they end facing the same way", () => {
    const jumps = [hop(2, "north"), hop(4, "north")];
    expect(playableEvents(jumps, "knight")).toEqual(jumps);
  });
});

describe("jumpPlan", () => {
  const from: Pos = [3, 3];
  /** A jump as the engine reports it: the long leg first (to `via`), then the short leg, which sets the facing. */
  const jump = ([dx, dy]: Pos, shortFacing: Facing): GameEvent => {
    const to: Pos = [from[0] + dx, from[1] + dy];
    const via: Pos = Math.abs(dx) > Math.abs(dy) ? [to[0], from[1]] : [from[0], to[1]];
    return { kind: "jump", from, via, state: { ...at(0, shortFacing), pos: to } };
  };

  const shapes: Array<[string, Pos, Pos, Facing, Facing]> = [
    // [name, (dx, dy), corner, the long leg's facing, the short leg's facing]
    ["east then north", [2, 1], [5, 3], "east", "north"],
    ["east then south", [2, -1], [5, 3], "east", "south"],
    ["west then north", [-2, 1], [1, 3], "west", "north"],
    ["west then south", [-2, -1], [1, 3], "west", "south"],
    ["north then east", [1, 2], [3, 5], "north", "east"],
    ["north then west", [-1, 2], [3, 5], "north", "west"],
    ["south then east", [1, -2], [3, 1], "south", "east"],
    ["south then west", [-1, -2], [3, 1], "south", "west"],
  ];

  it.each(shapes)("plays %s: the corner first, then the landing square, facing each leg's way", (_name, d, corner, longFacing, shortFacing) => {
    const event = jump(d, shortFacing);
    const plan = jumpPlan(event, 378)!;
    expect(plan.map((leg) => leg.to)).toEqual([corner, event.state.pos]);
    expect(plan.map((leg) => leg.facing)).toEqual([longFacing, shortFacing]);
    expect(plan.map((leg) => leg.easing)).toEqual(["ease-in", "ease-out"]);
  });

  it("gives the long leg 0.6 of the time and the short leg 0.4, adding up to all of it", () => {
    const [long, short] = jumpPlan(jump([2, 1], "north"), 400)!;
    expect(long.ms).toBeCloseTo(240);
    expect(short.ms).toBeCloseTo(160);
    expect(long.ms + short.ms).toBeCloseTo(400);
  });

  it("gives no plan without a corner or without a square it left", () => {
    const { via: _via, ...noVia } = jump([2, 1], "north");
    const { from: _from, ...noFrom } = jump([2, 1], "north");
    expect(jumpPlan(noVia, 400)).toBeUndefined();
    expect(jumpPlan(noFrom, 400)).toBeUndefined();
  });

  it("gives no plan for another kind of event, or a first leg that isn't straight", () => {
    expect(jumpPlan({ ...jump([2, 1], "north"), kind: "move" }, 400)).toBeUndefined();
    expect(jumpPlan({ ...jump([2, 1], "north"), via: [4, 4] }, 400)).toBeUndefined();
    expect(jumpPlan({ ...jump([2, 1], "north"), via: from }, 400)).toBeUndefined();
  });
});
