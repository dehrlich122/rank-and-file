import { describe, expect, it } from "vitest";
import type { Var } from "../py/protocol";
import { piecesFirst } from "./panels";

const v = (name: string, type: string): Var => ({ name, value: "0", type });
const names = (vars: Var[]) => vars.map((x) => x.name).join(",");

describe("piecesFirst: the variables panel's order", () => {
  it("puts the knight first on a knight level, then the player's variables in order", () => {
    const vars = [v("steps", "int"), v("knight", "Knight"), v("me", "Knight"), v("tag", "str")];
    expect(names(piecesFirst(vars, "knight"))).toBe("knight,me,steps,tag");
  });

  it("keeps the pawn level's order as before", () => {
    const vars = [v("steps", "int"), v("pawn", "Pawn"), v("tag", "str")];
    expect(names(piecesFirst(vars, "pawn"))).toBe("pawn,steps,tag");
  });

  it("leaves the order alone when no variable holds the piece", () => {
    expect(names(piecesFirst([v("steps", "int"), v("tag", "str")], "knight"))).toBe("steps,tag");
    expect(names(piecesFirst([v("a", "Pawn"), v("b", "int")], "knight"))).toBe("a,b");
  });
});
