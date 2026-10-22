import { describe, expect, it } from "vitest";
import { chapters, type ChallengeSet, type LevelSource } from "../content";
import { challengeGroups, drawsOnText, hubCounts, tierHasChallenges, type HubFacts } from "./freePlay";
import type { ListState } from "./listControls";

const level = (id: string, difficulty?: number, draws_on: number[] = []): LevelSource => ({ id, chapter: 0, title: id, trains: "", mastery: false, lesson: "", data: { draws_on }, set: "s", difficulty });
const set = (tier: string, levels: LevelSource[], id = tier): ChallengeSet => ({ set: id, title: id, tier, summary: "", levels });
const any: ListState = { tier: null, difficulty: null, sort: "order" };
const facts = (over: Partial<HubFacts> = {}): HubFacts => ({ sets: [], solved: () => false, myLevels: 0, shared: 0, abilities: 1, skins: [{ unlocked: true }, { unlocked: false }], ...over });

describe("hubCounts", () => {
  it("says Coming soon while no set has a level, and counts solved over total once one does", () => {
    expect(hubCounts(facts({ sets: [set("pawn", [])] })).challenges).toBe("Coming soon");
    const sets = [set("pawn", [level("a"), level("b")]), set("knight", [level("c")])];
    expect(hubCounts(facts({ sets, solved: (id) => id !== "b" })).challenges).toBe("2 of 3 solved");
  });

  it("uses singular and plural forms", () => {
    expect(hubCounts(facts({ myLevels: 1, shared: 1, abilities: 1 }))).toMatchObject({ levels: "1 level", shared: "1 level", sandbox: "1 ability" });
    expect(hubCounts(facts({ myLevels: 0, shared: 3, abilities: 7 }))).toMatchObject({ levels: "0 levels", shared: "3 levels", sandbox: "7 abilities" });
  });

  it("counts the unlocked skins", () => {
    expect(hubCounts(facts()).skins).toBe("1 of 2 unlocked");
  });
});

describe("challengeGroups", () => {
  const sets = [set("pawn", [level("p1", 3), level("p2", 1), level("p3", 5)]), set("knight", [level("k1", 2)])];

  it("keeps each set's order, counts solved in the whole set, and keeps an empty set", () => {
    const groups = challengeGroups([...sets, set("rook", [])], any, (id) => id === "p2");
    expect(groups.map((g) => [g.set.tier, g.levels.map((l) => l.id), g.solved])).toEqual([
      ["pawn", ["p1", "p2", "p3"], 1],
      ["knight", ["k1"], 0],
      ["rook", [], 0],
    ]);
  });

  it("hides whole sets by tier", () => {
    expect(challengeGroups(sets, { ...any, tier: "knight" }, () => false).map((g) => g.set.tier)).toEqual(["knight"]);
  });

  it("filters and sorts by difficulty within each set", () => {
    const pawn = (state: ListState) => challengeGroups(sets, state, () => false)[0]!.levels.map((l) => l.id);
    expect(pawn({ ...any, difficulty: 3 })).toEqual(["p1"]);
    expect(pawn({ ...any, sort: "easiest" })).toEqual(["p2", "p1", "p3"]);
    expect(pawn({ ...any, sort: "hardest" })).toEqual(["p3", "p1", "p2"]);
    expect(challengeGroups(sets, { ...any, difficulty: 3 }, () => false)[1]!.levels).toEqual([]);
  });
});

describe("pointers", () => {
  it("point only to a tier that has a challenge set", () => {
    const sets = [set("pawn", [])];
    expect(tierHasChallenges("pawn", sets)).toBe(true);
    expect(tierHasChallenges("knight", sets)).toBe(false);
    expect(tierHasChallenges("pawn", [])).toBe(false);
  });
});

describe("drawsOnText", () => {
  it("names the chapters a challenge draws on, and nothing when it names none", () => {
    const first = chapters.find((c) => c.curriculum)!;
    expect(drawsOnText(level("a", 1, [first.chapter]))).toBe(`Draws on Chapter ${first.chapter} · ${first.title}`);
    expect(drawsOnText(level("a", 1))).toBe("");
    expect(drawsOnText(level("a", 1, [9999]))).toBe("");
  });
});
