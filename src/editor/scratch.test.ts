// The Sandbox's scratch level (QA-061): what a fresh browser starts with, what is kept, and what a bad value under the key does.
import { describe, expect, it } from "vitest";
import { memoryStorage } from "../storage.fake";
import { draftToLevelData } from "./levelData";
import { resize } from "./edit";
import { scratch as sharedStore, ScratchStore, scratchStart } from "./scratch";
import { setSolution } from "./rules";

const KEY = "rank-and-file:sandbox";
const ABILITIES = ["move", "turn_left", "turn_right", "look"];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

describe("a fresh browser", () => {
  it("starts with an open 8 x 8, the piece bottom-left facing north, a goal top-right and every ability", () => {
    const draft = new ScratchStore(memoryStorage()).load(ABILITIES);
    expect([draft.width, draft.height, draft.facing]).toEqual([8, 8, "north"]);
    expect([draft.start, draft.goal]).toEqual([[0, 0], [7, 7]]);
    expect(draft.api).toEqual(ABILITIES);
    expect(draft.enemies).toEqual([]);
    expect(draft.cells.flat().every((cell) => cell.tile === "floor")).toBe(true);
  });

  it("is a level named Sandbox with a brief and starter code, and none of what publishing a level needs", () => {
    const draft = scratchStart(ABILITIES);
    expect([draft.id, draft.title, draft.trains]).toEqual(["sandbox", "Sandbox", ""]);
    expect(draft.brief.length).toBeGreaterThan(0);
    const data = draftToLevelData(draft);
    expect(typeof data.starter).toBe("string");
    for (const key of ["hints", "solution", "difficulty"]) expect(key in data).toBe(false);
  });

  it("has no code kept", () => {
    expect(new ScratchStore(memoryStorage()).code()).toBeUndefined();
  });

  it("reads nothing when the browser has no storage", () => {
    const store = new ScratchStore(null);
    expect(store.load(ABILITIES).width).toBe(8);
    expect(() => (store.save(scratchStart(ABILITIES)), store.setCode("x"))).not.toThrow();
  });
});

describe("a round trip", () => {
  it("keeps the board a player changed, under the Sandbox's own key", () => {
    const storage = memoryStorage();
    const store = new ScratchStore(storage);
    const wide = resize(scratchStart(ABILITIES), 10, 6).draft;
    store.save({ ...wide, api: ["move"], facing: "east" });
    const back = new ScratchStore(storage).load(ABILITIES);
    expect([back.width, back.height, back.facing, back.api]).toEqual([10, 6, "east", ["move"]]);
    expect(same(draftToLevelData(back), draftToLevelData({ ...wide, api: ["move"], facing: "east" }))).toBe(true);
    expect(storage.getItem(KEY)).not.toBeNull();
  });

  it("keeps the code beside the board without either undoing the other", () => {
    const storage = memoryStorage();
    const store = new ScratchStore(storage);
    store.setCode("pawn.move()\n");
    store.save(resize(scratchStart(ABILITIES), 5, 5).draft);
    store.setCode("pawn.move()\npawn.move()\n");
    const back = new ScratchStore(storage);
    expect(back.code()).toBe("pawn.move()\npawn.move()\n");
    expect(back.load(ABILITIES).width).toBe(5);
  });

  it("keeps an empty code as an empty code, not as none", () => {
    const store = new ScratchStore(memoryStorage());
    store.setCode("");
    expect(store.code()).toBe("");
  });

  it("is always the Sandbox, whatever the draft saved said", () => {
    const store = new ScratchStore(memoryStorage());
    store.save(setSolution({ ...scratchStart(ABILITIES), id: "abc", title: "Mine", trains: "loops" }, "pawn.move()"));
    const back = store.load(ABILITIES);
    expect([back.id, back.title, back.trains]).toEqual(["sandbox", "Sandbox", ""]);
    expect("solution" in draftToLevelData(back)).toBe(false);
  });

  it("is a different store from the app's: nothing is written outside its key", () => {
    const storage = memoryStorage();
    new ScratchStore(storage).save(scratchStart(ABILITIES));
    expect(storage.getItem("rank-and-file:editor")).toBeNull();
    expect(sharedStore).toBeInstanceOf(ScratchStore);
  });
});

describe("a value that is not a scratch level", () => {
  const damaged: Array<[string, string]> = [
    ["the old Sandbox's code, as a string", JSON.stringify("pawn.move()")],
    ["an empty string, as Reset progress left it", JSON.stringify("")],
    ["a number", "7"],
    ["a list", "[1, 2]"],
    ["text that is not JSON", "{not json"],
    ["a level that is not an object", JSON.stringify({ level: "nope", code: 3 })],
    ["a level whose board is broken", JSON.stringify({ level: { id: "sandbox", map: 5 }, code: "x" })],
  ];
  for (const [what, value] of damaged) {
    it(`starts again from ${what}, and never throws`, () => {
      const store = new ScratchStore(memoryStorage({ [KEY]: value }));
      const draft = store.load(ABILITIES);
      expect([draft.width, draft.height, draft.id]).toEqual([8, 8, "sandbox"]);
      expect(draft.api).toEqual(ABILITIES);
      expect(["string", "undefined"]).toContain(typeof store.code());
      expect(() => (store.save(draft), store.setCode("a"))).not.toThrow();
      expect(store.code()).toBe("a");
    });
  }

  it("ignores a code that is not text", () => {
    expect(new ScratchStore(memoryStorage({ [KEY]: JSON.stringify({ code: 3 }) })).code()).toBeUndefined();
  });
});

describe("start over", () => {
  it("brings back the starting board and code, and the kept ones go", () => {
    const storage = memoryStorage();
    const store = new ScratchStore(storage);
    store.save(resize(scratchStart(ABILITIES), 4, 4).draft);
    store.setCode("pawn.move()\n");
    const fresh = store.startOver(ABILITIES);
    expect(same(fresh, scratchStart(ABILITIES))).toBe(true);
    expect(store.code()).toBeUndefined();
    expect(store.load(ABILITIES).width).toBe(8);
  });
});
