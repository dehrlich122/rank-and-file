import { describe, expect, it } from "vitest";
import type { Pos, TileKind } from "../py/protocol";
import { describeBoard } from "./boardText";

const level = { width: 5, height: 4, piece: "pawn", goal: [2, 3] as Pos };
const noGoal = { ...level, goal: null };
const at = { pos: [0, 1] as Pos, facing: "north" as const };
const knight = { ...noGoal, piece: "knight" };

describe("describeBoard", () => {
  it("says what it always said for a state without landings", () => {
    expect(describeBoard(level, at)).toBe("5 by 4 board. Your pawn is on a2, facing north. The goal is on c4.");
    expect(describeBoard(noGoal, at)).toBe("5 by 4 board. Your pawn is on a2, facing north.");
    expect(describeBoard(level, { ...at, lost: [1, 1] as Pos })).toBe(
      "5 by 4 board. Your pawn is on a2, facing north. The goal is on c4. The run was lost on b2.",
    );
  });

  it("names one, two and several landing squares", () => {
    expect(describeBoard(knight, { ...at, landings: [[1, 2]] })).toBe(
      "5 by 4 board. Your knight is on a2, facing north. It can land on b3.",
    );
    expect(describeBoard(knight, { ...at, landings: [[1, 2], [2, 1]] })).toContain("It can land on b3 and c2.");
    expect(describeBoard(knight, { ...at, landings: [[1, 2], [2, 1], [3, 4]] })).toContain("It can land on b3, c2 and d5.");
  });

  it("adds nothing for an empty list", () => {
    expect(describeBoard(knight, { ...at, landings: [] })).toBe(describeBoard(knight, at));
  });

  it("puts the sentence straight after the piece's sentence", () => {
    const text = describeBoard({ ...level, piece: "knight" }, { ...at, lost: [1, 1] as Pos, landings: [[1, 2]] });
    expect(text).toBe(
      "5 by 4 board. Your knight is on a2, facing north. It can land on b3. The goal is on c4. The run was lost on b2.",
    );
  });

  describe("keys, doors and gates", () => {
    const row = (...kinds: Array<[number, TileKind]>) => {
      const cells = Array<TileKind>(5).fill("floor");
      for (const [x, kind] of kinds) cells[x] = kind;
      return cells;
    };
    const rows: TileKind[][] = [row([1, "gate"], [2, "timed_gate"]), row(), row(), row([3, "gate"])];
    const brass = { pos: [2, 2] as Pos, name: "brass" as string | number };
    const keys = [brass, { pos: [4, 3] as Pos, name: 12 }];
    const doors = [{ pos: [4, 3] as Pos, key: "brass" }, { pos: [0, 0] as Pos, key: 12 }];
    const board = { ...noGoal, tiles: rows, keys, doors };

    it("names the keys left to pick up", () => {
      expect(describeBoard({ ...noGoal, keys }, at)).toBe("5 by 4 board. Your pawn is on a2, facing north. To pick up: the brass key on c3 and key 12 on e4.");
      expect(describeBoard({ ...noGoal, keys: [brass] }, at)).toContain("To pick up: the brass key on c3.");
      expect(describeBoard({ ...noGoal, keys }, { ...at, collected: [[2, 2], [4, 3]] })).toBe(describeBoard(noGoal, at));
    });

    it("says a door is locked, then open once its key is carried", () => {
      expect(describeBoard({ ...noGoal, doors }, at)).toContain("The door on e4 is locked: it wants the brass key. The door on a1 is locked: it wants key 12.");
      expect(describeBoard({ ...noGoal, doors }, { ...at, inventory: ["brass"] })).toContain("The door on e4 is open. The door on a1 is locked");
    });

    it("says a gate is shut or open, and leaves a timed gate out", () => {
      const text = describeBoard({ ...noGoal, tiles: rows }, at);
      expect(text.endsWith("The guard's gate on b1 is shut. The guard's gate on d4 is shut.")).toBe(true);
      expect(text).not.toContain("c1");
      expect(describeBoard({ ...noGoal, tiles: rows }, { ...at, opened: [[1, 0]] })).toContain("The guard's gate on b1 is open. The guard's gate on d4 is shut.");
    });

    it("keeps the label's order, and follows the state through a rewind", () => {
      const state = { ...at, landings: [[1, 2]] as Pos[], lost: [1, 1] as Pos };
      expect(describeBoard({ ...board, piece: "knight", goal: [2, 3] }, state)).toBe(
        "5 by 4 board. Your knight is on a2, facing north. It can land on b3. To pick up: the brass key on c3 and key 12 on e4. " +
          "The door on e4 is locked: it wants the brass key. The door on a1 is locked: it wants key 12. " +
          "The guard's gate on b1 is shut. The guard's gate on d4 is shut. The goal is on c4. The run was lost on b2.",
      );
      const carried = describeBoard(board, { ...at, collected: [[2, 2]], inventory: ["brass"] });
      expect(carried).toContain("To pick up: key 12 on e4.");
      expect(carried).toContain("The door on e4 is open.");
      expect(describeBoard(board, at)).toContain("To pick up: the brass key on c3 and key 12 on e4.");
    });
  });
});
