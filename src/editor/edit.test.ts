import { describe, expect, it } from "vitest";
import type { Pos } from "../py/protocol";
import { blankDraft, type Draft } from "./draft";
import { clearBoard, erase, extendRoute, fill, moveEnemy, newCell, paint, placeEnemy, placeGoal, placeStart, rectangle, removeCorner, removeEnemy, resize, rotateStart, toggleSpot, type Edit } from "./edit";

const ok = (edit: Edit): Draft => {
  if ("refused" in edit) throw new Error(`refused: ${edit.refused}`);
  return edit.draft;
};
const refused = (edit: Edit): string => ("refused" in edit ? edit.refused : "(allowed)");
const note = (edit: Edit): string => ("draft" in edit ? edit.note : "(refused)");
const draft = () => blankDraft(6, 5, "my-test"); // start a1, goal f5
const tileAt = (d: Draft, [x, y]: Pos) => d.cells[y]![x]!.tile;

describe("painting", () => {
  it("puts a tile on a square, leaving the old draft alone", () => {
    const before = draft();
    const after = ok(paint(before, [2, 2], "wall", []));
    expect(tileAt(after, [2, 2])).toBe("wall");
    expect(tileAt(before, [2, 2])).toBe("floor");
    expect(after.cells[0]).toBe(before.cells[0]); // unchanged rows are shared
  });

  it("gives a new tile the details it needs", () => {
    const sign = ok(paint(draft(), [1, 1], "sign", ["text"]));
    expect(sign.cells[1]![1]).toEqual({ tile: "sign", text: "Edit me" });
    const gate = ok(paint(draft(), [1, 1], "gate", ["passphrase"]));
    expect(gate.cells[1]![1]).toEqual({ tile: "gate", passphrase: "open sesame" });
    expect(newCell("timed_gate", ["every"])).toEqual({ tile: "timed_gate", every: 4 });
    expect(newCell("pit", [])).toEqual({ tile: "pit" });
  });

  it("painting floor clears a square", () => {
    const walled = ok(paint(draft(), [2, 2], "wall", []));
    expect(tileAt(ok(paint(walled, [2, 2], "floor", [])), [2, 2])).toBe("floor");
    expect(refused(paint(draft(), [2, 2], "floor", []))).toMatch(/already floor/);
  });

  it("won't paint over the start, the goal or a hidden-goal square, or the same tile twice, or off the board", () => {
    expect(refused(paint(draft(), [0, 0], "wall", []))).toMatch(/start is on a1/);
    expect(refused(paint(draft(), [5, 4], "wall", []))).toMatch(/goal is on f5/);
    expect(refused(paint(ok(toggleSpot(draft(), [3, 3])), [3, 3], "wall", []))).toMatch(/hidden goal is on d4/);
    expect(refused(paint(ok(paint(draft(), [2, 2], "wall", [])), [2, 2], "wall", []))).toMatch(/already a wall/);
    expect(refused(paint(draft(), [9, 9], "wall", []))).toMatch(/off the board/);
  });

  it("allows what only the engine should judge: a wall under an enemy", () => {
    const withEnemy = ok(placeEnemy(draft(), [3, 3], "rook"));
    expect(tileAt(ok(paint(withEnemy, [3, 3], "wall", [])), [3, 3])).toBe("wall");
  });
});

describe("erasing", () => {
  it("takes away an enemy first, then the goal or ?, then the tile", () => {
    let d = ok(paint(draft(), [2, 2], "pit", []));
    d = ok(placeEnemy(d, [2, 2], "chaser"));
    d = ok(erase(d, [2, 2]));
    expect(d.enemies).toHaveLength(0);
    expect(tileAt(d, [2, 2])).toBe("pit");
    expect(tileAt(ok(erase(d, [2, 2])), [2, 2])).toBe("floor");
    expect(ok(erase(d, [5, 4])).goal).toBeNull();
  });

  it("won't erase the start, or nothing", () => {
    expect(refused(erase(draft(), [0, 0]))).toMatch(/start can't be erased/);
    expect(refused(erase(draft(), [3, 3]))).toMatch(/nothing on d4/);
  });
});

describe("the start, goal and ? squares", () => {
  it("move: one start, one goal", () => {
    const d = ok(placeGoal(ok(placeStart(draft(), [2, 0])), [3, 4]));
    expect([d.start, d.goal]).toEqual([
      [2, 0],
      [3, 4],
    ]);
  });

  it("put floor under themselves", () => {
    const walled = ok(paint(draft(), [2, 2], "wall", []));
    expect(tileAt(ok(placeStart(walled, [2, 2])), [2, 2])).toBe("floor");
    expect(tileAt(ok(placeGoal(walled, [2, 2])), [2, 2])).toBe("floor");
    expect(tileAt(ok(toggleSpot(walled, [2, 2])), [2, 2])).toBe("floor");
  });

  it("keep out of each other's squares", () => {
    expect(refused(placeStart(draft(), [5, 4]))).toMatch(/goal/);
    expect(refused(placeGoal(draft(), [0, 0]))).toMatch(/start/);
    expect(refused(toggleSpot(draft(), [0, 0]))).toMatch(/start/);
    expect(refused(placeStart(draft(), [0, 0]))).toMatch(/already/);
  });

  it("a goal and ? squares replace each other, and say so", () => {
    const spotted = toggleSpot(draft(), [1, 1]);
    expect(ok(spotted).goal).toBeNull();
    expect(note(spotted)).toMatch(/goal is gone/);
    const goaled = placeGoal(ok(spotted), [4, 4]);
    expect(ok(goaled).spots).toEqual([]);
    expect(note(goaled)).toMatch(/\? squares are gone/);
  });

  it("a second ? on the same square takes it away", () => {
    const d = ok(toggleSpot(ok(toggleSpot(draft(), [1, 1])), [2, 2]));
    expect(d.spots).toEqual([
      [1, 1],
      [2, 2],
    ]);
    expect(ok(toggleSpot(d, [1, 1])).spots).toEqual([[2, 2]]);
  });

  it("the start turns clockwise", () => {
    const facings = [draft()];
    for (let i = 0; i < 4; i++) facings.push(ok(rotateStart(facings[i]!)));
    expect(facings.map((d) => d.facing)).toEqual(["north", "east", "south", "west", "north"]);
  });
});

describe("enemies", () => {
  it("places one, and only one to a square", () => {
    const d = ok(placeEnemy(draft(), [2, 2], "patrol"));
    expect(d.enemies).toEqual([{ kind: "patrol", start: [2, 2] }]);
    expect(refused(placeEnemy(d, [2, 2], "rook"))).toMatch(/already an enemy/);
    expect(ok(removeEnemy(d, 0)).enemies).toEqual([]);
    expect(refused(removeEnemy(d, 3))).toMatch(/no such enemy/);
  });

  it("moves, taking a patrol's whole route with it", () => {
    let d = ok(placeEnemy(draft(), [1, 1], "patrol"));
    d = ok(extendRoute(d, 0, [4, 1]));
    d = ok(moveEnemy(d, 0, [1, 3]));
    expect(d.enemies[0]).toEqual({
      kind: "patrol",
      start: [1, 3],
      route: [
        [1, 3],
        [4, 3],
      ],
    });
    expect(refused(moveEnemy(d, 0, [3, 3]))).toMatch(/route would leave the board/);
    expect(refused(moveEnemy(d, 0, [1, 3]))).toMatch(/already there/);
  });

  it("grows a patrol's route in straight lines only", () => {
    let d = ok(placeEnemy(draft(), [1, 1], "patrol"));
    expect(refused(extendRoute(d, 0, [2, 2]))).toMatch(/straight/);
    d = ok(extendRoute(d, 0, [4, 1]));
    d = ok(extendRoute(d, 0, [4, 3]));
    expect(d.enemies[0]!.route).toEqual([
      [1, 1],
      [4, 1],
      [4, 3],
    ]);
    expect(refused(extendRoute(d, 0, [4, 3]))).toMatch(/already there/);
    expect(refused(extendRoute(ok(placeEnemy(d, [0, 4], "rook")), 1, [0, 3]))).toMatch(/Only a patrol/);
  });

  it("drops a corner, and a patrol with no corner left stands guard", () => {
    let d = ok(placeEnemy(draft(), [1, 1], "patrol"));
    d = ok(extendRoute(ok(extendRoute(d, 0, [4, 1])), 0, [4, 3]));
    d = ok(removeCorner(d, 0, 2));
    expect(d.enemies[0]!.route).toEqual([
      [1, 1],
      [4, 1],
    ]);
    d = ok(removeCorner(d, 0, 1));
    expect(d.enemies[0]).toEqual({ kind: "patrol", start: [1, 1] });
    expect(refused(removeCorner(d, 0, 1))).toMatch(/no such corner/);
  });
});

describe("filling a rectangle", () => {
  it("lists its squares whichever corners it's dragged between", () => {
    expect(rectangle([2, 1], [0, 2])).toHaveLength(6);
    expect(rectangle([1, 1], [1, 1])).toEqual([[1, 1]]);
  });

  it("applies a change to each square, skipping the ones it refuses", () => {
    const d = ok(fill(draft(), [0, 0], [2, 0], (draft, pos) => paint(draft, pos, "wall", [])));
    expect([0, 1, 2].map((x) => tileAt(d, [x, 0]))).toEqual(["floor", "wall", "wall"]); // a1 is the start
    expect(refused(fill(draft(), [0, 0], [0, 0], (draft, pos) => paint(draft, pos, "wall", [])))).toMatch(/Nothing there/);
  });
});

describe("resizing", () => {
  it("grows to the right and the top, keeping everything", () => {
    const walled = ok(paint(draft(), [2, 2], "wall", []));
    const { draft: bigger, lost } = resize(walled, 8, 7);
    expect(lost).toEqual([]);
    expect([bigger.width, bigger.height, bigger.cells.length, bigger.cells[0]!.length]).toEqual([8, 7, 7, 8]);
    expect(tileAt(bigger, [2, 2])).toBe("wall");
    expect(bigger.goal).toEqual([5, 4]);
  });

  it("shrinks, and says what it drops", () => {
    let d = ok(paint(draft(), [5, 0], "wall", []));
    d = ok(placeEnemy(d, [4, 2], "rook"));
    d = ok(placeEnemy(d, [1, 1], "bishop"));
    const { draft: smaller, lost } = resize(d, 4, 4);
    expect(lost).toEqual(["1 square with something on it", "the goal on f5", "the rook on e3"]);
    expect(smaller.enemies.map((enemy) => enemy.kind)).toEqual(["bishop"]);
    expect(smaller.goal).toBeNull();
  });

  it("drops the ? squares that no longer fit", () => {
    const d = ok(toggleSpot(ok(toggleSpot(draft(), [4, 1])), [1, 1]));
    const { draft: smaller, lost } = resize(d, 4, 4);
    expect(lost).toEqual(["1 of the ? squares"]);
    expect(smaller.spots).toEqual([[1, 1]]);
  });

  it("keeps the start on the board", () => {
    const moved = ok(placeStart(draft(), [5, 0]));
    const { draft: smaller, lost } = resize(moved, 3, 3);
    expect(smaller.start).toEqual([2, 0]);
    expect(lost).toContain("the start moves to c1");
  });
});

describe("clearing the board", () => {
  it("takes away tiles, enemies and ? squares, and keeps the start and the goal", () => {
    let d = ok(paint(draft(), [2, 2], "wall", []));
    d = ok(placeEnemy(d, [3, 3], "rook"));
    const cleared = clearBoard(d);
    expect(cleared.cells.flat().every((cell) => cell.tile === "floor")).toBe(true);
    expect([cleared.enemies, cleared.spots, cleared.start, cleared.goal]).toEqual([[], [], [0, 0], [5, 4]]);
    const spotted = ok(toggleSpot(draft(), [2, 2]));
    expect(clearBoard(spotted).spots).toEqual([]);
  });
});
