import { describe, expect, it } from "vitest";
import type { Pos } from "../py/protocol";
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
});
