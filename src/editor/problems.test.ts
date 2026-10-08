import { describe, expect, it } from "vitest";
import { placeProblem } from "./problems";

describe("placeProblem", () => {
  it("marks the square the engine names", () => {
    expect(placeProblem("m", { square: "c4" })).toEqual({ message: "m", squares: [[2, 3]], enemy: null, field: null });
  });

  it("turns an enemy's number (from 1) into its place in the list (from 0), with its square", () => {
    expect(placeProblem("m", { enemy: 2, square: "b3" })).toEqual({ message: "m", squares: [[1, 2]], enemy: 1, field: null });
  });

  it("marks every square the engine names, when it names several", () => {
    expect(placeProblem("m", { squares: ["a1", "c3"] }).squares).toEqual([
      [0, 0],
      [2, 2],
    ]);
    expect(placeProblem("m", { squares: [] }).squares).toEqual([]);
  });

  it("names a field, and copes with a problem with no place", () => {
    expect(placeProblem("m", { field: "goal" })).toMatchObject({ field: "goal", squares: [], enemy: null });
    expect(placeProblem("m", null)).toEqual({ message: "m", squares: [], enemy: null, field: null });
  });
});
