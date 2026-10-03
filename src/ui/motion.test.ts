import { describe, expect, it } from "vitest";
import type { Facing, GameEvent, WorldState } from "../py/protocol";
import { playableEvents } from "./motion";

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
