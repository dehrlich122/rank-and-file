import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asFake, type Fake, fakeDocument } from "./dom.fake";
import { applyList, boardsText, listControls, showTier, starsText, type ListState } from "./listControls";

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

describe("listControls", () => {
  beforeEach(() => vi.stubGlobal("document", fakeDocument));
  afterEach(() => vi.unstubAllGlobals());

  const choose = (select: Fake | undefined, value: string) => {
    select!.value = value;
    select!.fire("change");
  };
  const rowOf = (listId: string, onChange = () => {}) => {
    const controls = listControls(listId, ["pawn", "knight"], onChange);
    const [tier, difficulty, sort] = asFake(controls.element).all("select");
    return { controls, tier, difficulty, sort };
  };

  it("keeps each choice and tells the list after every change", () => {
    const seen: ListState[] = [];
    const row = rowOf("a", () => seen.push(row.controls.state()));
    choose(row.tier, "knight");
    choose(row.difficulty, "4");
    choose(row.sort, "hardest");
    choose(row.difficulty, "");
    expect(seen).toEqual([
      { tier: "knight", difficulty: null, sort: "order" },
      { tier: "knight", difficulty: 4, sort: "order" },
      { tier: "knight", difficulty: 4, sort: "hardest" },
      { tier: "knight", difficulty: null, sort: "hardest" },
    ]);
  });
  it("remembers a list's choices for the visit, apart from other lists'", () => {
    const first = rowOf("mine");
    choose(first.tier, "pawn");
    choose(first.sort, "easiest");
    expect(rowOf("mine").controls.state()).toEqual({ tier: "pawn", difficulty: null, sort: "easiest" });
    expect(rowOf("other").controls.state()).toEqual(any);
  });
  it("clears the filters, in the selects too, and keeps the sort", () => {
    let changes = 0;
    const row = rowOf("b", () => changes++);
    choose(row.tier, "pawn");
    choose(row.difficulty, "2");
    choose(row.sort, "hardest");
    row.controls.clear();
    expect(row.controls.state()).toEqual({ tier: null, difficulty: null, sort: "hardest" });
    expect([row.tier!.value, row.difficulty!.value]).toEqual(["", ""]);
    expect(changes).toBe(4);
  });
  it("opens a list on one tier: difficulty any, the sort kept, other lists untouched", () => {
    const first = rowOf("shown");
    choose(first.tier, "pawn");
    choose(first.difficulty, "2");
    choose(first.sort, "hardest");
    showTier("shown", "knight");
    const row = rowOf("shown");
    expect(row.controls.state()).toEqual({ tier: "knight", difficulty: null, sort: "hardest" });
    const chosen = (select: Fake | undefined) => select!.all("option").filter((o) => o.attributes.has("selected")).map((o) => o.attributes.get("value"));
    expect([chosen(row.tier), chosen(row.difficulty)]).toEqual([["knight"], [""]]);
    expect(rowOf("not-shown").controls.state()).toEqual(any);
  });
  it("labels each select and offers Any first", () => {
    const row = asFake(listControls("c", ["pawn"], () => {}).element);
    expect(row.all("label").length).toBe(3);
    expect(row.all("select")[0]!.all("option")[0]!.text).toBe("Any");
    expect(row.find("list-controls").length).toBe(1);
  });
});

describe("what the lists' rows say", () => {
  it("words the stars", () => {
    expect(starsText(0)).toBe("not solved yet");
    expect(starsText(2)).toBe("★★☆");
    expect(starsText(3)).toBe("★★★");
  });
  it("words the boards", () => {
    expect(boardsText(1)).toBe("1 board");
    expect(boardsText(3)).toBe("3 boards");
  });
});
