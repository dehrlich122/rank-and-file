import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyList, listControls, listState, saveListState, type ListState } from "./listControls";

const any: ListState = { tier: null, difficulty: null, sort: "order" };
type Item = { id: string; tier: string | null; difficulty: number | null };
const items: Item[] = [
  { id: "a", tier: "pawn", difficulty: 3 },
  { id: "b", tier: "knight", difficulty: null },
  { id: "c", tier: "pawn", difficulty: 1 },
  { id: "d", tier: null, difficulty: 3 },
  { id: "e", tier: "knight", difficulty: 1 },
];
const ids = (list: Item[]) => list.map((i) => i.id).join("");
const run = (state: Partial<ListState>) => ids(applyList(items, { ...any, ...state }, (i) => i));

describe("applyList", () => {
  it("keeps the order and everything when nothing is set", () => expect(run({})).toBe("abcde"));
  it("filters by tier, dropping items with no tier", () => expect(run({ tier: "pawn" })).toBe("ac"));
  it("filters by difficulty, dropping items with none", () => expect(run({ difficulty: 3 })).toBe("ad"));
  it("combines the filters", () => expect(run({ tier: "knight", difficulty: 1 })).toBe("e"));
  it("sorts easiest first, stably, unrated last", () => expect(run({ sort: "easiest" })).toBe("ceadb"));
  it("sorts hardest first, stably, unrated last", () => expect(run({ sort: "hardest" })).toBe("adceb"));
  it("does not change the input", () => {
    run({ sort: "hardest" });
    expect(ids(items)).toBe("abcde");
  });
});

describe("listState", () => {
  it("defaults for an unknown list and remembers what was saved", () => {
    expect(listState("nowhere")).toEqual(any);
    saveListState("mine", { tier: "pawn", difficulty: 2, sort: "hardest" });
    expect(listState("mine")).toEqual({ tier: "pawn", difficulty: 2, sort: "hardest" });
    expect(listState("other")).toEqual(any);
  });
});

// A document with just enough to build selects and fire a change (Node has no DOM here).
class Fake {
  kids: Array<Fake | string> = [];
  value = "";
  fire: (() => void) | undefined;
  constructor(readonly tag: string) {}
  setAttribute() {}
  addEventListener(_type: string, fn: () => void) {
    this.fire = fn;
  }
  append(...nodes: Array<Fake | string>) {
    this.kids.push(...nodes);
  }
  all(tag: string): Fake[] {
    const sub = this.kids.filter((k): k is Fake => typeof k !== "string").flatMap((k) => k.all(tag));
    return this.tag === tag ? [this, ...sub] : sub;
  }
}

describe("listControls", () => {
  beforeEach(() => vi.stubGlobal("document", { createElement: (tag: string) => new Fake(tag) }));
  afterEach(() => vi.unstubAllGlobals());

  it("reports the whole next state with only the changed field different", () => {
    const seen: ListState[] = [];
    const row = listControls(["pawn", "knight"], { ...any, sort: "easiest" }, (s) => seen.push(s)) as unknown as Fake;
    const [tier, difficulty, sort] = row.all("select");
    const choose = (select: Fake | undefined, value: string) => {
      select!.value = value;
      select!.fire!();
    };
    choose(tier, "knight");
    choose(difficulty, "4");
    choose(sort, "hardest");
    choose(difficulty, "");
    expect(seen).toEqual([
      { tier: "knight", difficulty: null, sort: "easiest" },
      { tier: null, difficulty: 4, sort: "easiest" },
      { tier: null, difficulty: null, sort: "hardest" },
      { tier: null, difficulty: null, sort: "easiest" },
    ]);
  });
  it("labels each select and offers Any first", () => {
    const row = listControls(["pawn"], any, () => {}) as unknown as Fake;
    expect(row.all("label").length).toBe(3);
    expect(row.all("select")[0]!.all("option")[0]!.kids[0]).toBe("Any");
  });
});
