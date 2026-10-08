import { describe, expect, it } from "vitest";
import { History } from "./history";

const clock = () => {
  let now = 0;
  return { now: () => now, wait: (ms: number) => void (now += ms) };
};

describe("History", () => {
  it("undoes and redoes, one change at a time", () => {
    const history = new History("a");
    history.set("b");
    history.set("c");
    expect([history.undo(), history.undo(), history.undo()]).toEqual(["b", "a", null]);
    expect([history.redo(), history.redo(), history.redo()]).toEqual(["b", "c", null]);
    expect(history.current).toBe("c");
  });

  it("a new change after an undo forgets what could be redone", () => {
    const history = new History("a");
    history.set("b");
    history.undo();
    history.set("c");
    expect(history.canRedo).toBe(false);
    expect(history.undo()).toBe("a");
  });

  it("ignores a change that changes nothing", () => {
    const history = new History("a");
    history.set("a");
    expect(history.canUndo).toBe(false);
  });

  it("makes a stroke one step", () => {
    const history = new History("a");
    history.begin();
    history.set("b");
    history.set("c");
    history.set("d");
    history.end();
    expect(history.undo()).toBe("a");
    expect(history.canUndo).toBe(false);
  });

  it("a stroke that changes nothing leaves nothing to undo", () => {
    const history = new History("a");
    history.begin();
    history.end();
    expect(history.canUndo).toBe(false);
  });

  it("undoing in the middle of a stroke ends it first", () => {
    const history = new History("a");
    history.begin();
    history.set("b");
    expect(history.undo()).toBe("a");
  });

  it("joins a burst of typing in one field, but not another field or a pause", () => {
    const time = clock();
    const history = new History("", time.now);
    history.set("h", "title");
    time.wait(200);
    history.set("he", "title");
    time.wait(200);
    history.set("hel", "title");
    history.set("hel!", "brief"); // another field
    time.wait(2000);
    history.set("hel!!", "brief"); // after a pause
    expect([history.undo(), history.undo(), history.undo(), history.undo()]).toEqual(["hel!", "hel", "", null]);
  });

  it("is only so deep", () => {
    const history = new History(0);
    for (let i = 1; i <= 150; i++) history.set(i);
    let undone = 0;
    while (history.undo() !== null) undone++;
    expect(undone).toBe(100);
  });
});
