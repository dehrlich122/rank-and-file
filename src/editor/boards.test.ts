import { describe, expect, it } from "vitest";
import { addBoard, boardCount, commitBoard, removeBoard, viewOf } from "./boards";
import { blankDraft, type Draft } from "./draft";
import { paint } from "./edit";

const two = (): Draft => {
  const first = blankDraft(4, 4, "my-test");
  const added = addBoard(first, 0, 6);
  if ("refused" in added) throw new Error(added.refused);
  return added.draft;
};

describe("boards", () => {
  it("start as one; adding copies the board you are on and says which board it made", () => {
    const first = blankDraft(4, 4);
    const added = addBoard(first, 0, 6);
    if ("refused" in added) throw new Error(added.refused);
    expect(boardCount(added.draft)).toBe(2);
    expect(added.index).toBe(1);
    expect(added.draft.boards[0]!.cells).toBe(first.cells); // shared, not copied: an edit never changes a board in place
    expect(added.draft.boards[0]!.start).toEqual(first.start);
  });

  it("are limited", () => {
    let draft = blankDraft();
    for (let i = 1; i < 3; i++) {
      const next = addBoard(draft, 0, 3);
      if ("refused" in next) throw new Error(next.refused);
      draft = next.draft;
    }
    expect(addBoard(draft, 0, 3)).toEqual({ refused: "A level can have at most 3 boards." });
  });

  it("show the first board as the draft itself, and another as its own squares with the level-wide text", () => {
    const draft = two();
    expect(viewOf(draft, 0)).toBe(draft);
    const view = viewOf(draft, 1);
    expect(view.title).toBe(draft.title);
    expect(view.cells).toBe(draft.boards[0]!.cells);
    expect(view.spots).toEqual([]);
  });

  it("take an edit of another board back into that board only", () => {
    const draft = two();
    const edit = paint(viewOf(draft, 1), [1, 1], "wall", []);
    if ("refused" in edit) throw new Error(edit.refused);
    const back = commitBoard(draft, 1, { ...edit.draft, title: "Renamed" });
    expect(back.boards[0]!.cells[1]![1]!.tile).toBe("wall");
    expect(back.cells[1]![1]!.tile).toBe("floor"); // the first board is as it was
    expect(back.title).toBe("Renamed"); // what is level-wide is kept
    expect(back.boards).toHaveLength(1);
  });

  it("keep the first board's hidden-goal squares when another board is edited", () => {
    const draft = { ...two(), goal: null, spots: [[1, 1]] as Draft["spots"] };
    const back = commitBoard(draft, 1, viewOf(draft, 1));
    expect(back.spots).toEqual([[1, 1]]);
  });

  it("go when removed; removing the first makes the second the first", () => {
    const draft = two();
    const narrower = commitBoard(draft, 1, { ...viewOf(draft, 1), width: 3 });
    const removed = removeBoard(narrower, 1);
    if ("refused" in removed) throw new Error(removed.refused);
    expect(boardCount(removed.draft)).toBe(1);
    expect(removed.index).toBe(0);
    const promoted = removeBoard(narrower, 0);
    if ("refused" in promoted) throw new Error(promoted.refused);
    expect(promoted.draft.width).toBe(3);
    expect(boardCount(promoted.draft)).toBe(1);
    expect(removeBoard(blankDraft(), 0)).toEqual({ refused: "A level needs at least one board." });
  });
});
