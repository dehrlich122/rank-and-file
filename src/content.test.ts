// Free play's challenge sets in the bundled content (M4.4). Never print level data here: compare and count only.
import { describe, expect, it } from "vitest";
import { challengeSets, chapters, codexChapters, findLevel, nextChallenge, nextLevel } from "./content";

describe("challenge sets", () => {
  it("lists the sets from levels/challenges.yaml, each with a known tier", () => {
    const tiers = new Set(chapters.map((chapter) => chapter.tier));
    expect(challengeSets.length).toBeGreaterThan(0);
    for (const set of challengeSets) {
      expect(tiers.has(set.tier)).toBe(true);
      expect(set.levels.every((level) => level.set === set.set && level.chapter === 0 && level.lesson === "")).toBe(true);
    }
  });

  it("keeps challenges out of every chapter, so they are never a curriculum level", () => {
    expect(chapters.every((chapter) => chapter.levels.every((level) => level.set === undefined))).toBe(true);
    for (const set of challengeSets) for (const level of set.levels) expect(nextLevel(level.id)).toBeUndefined();
  });

  it("finds a challenge by id, and the next one in its set", () => {
    for (const set of challengeSets) {
      set.levels.forEach((level, i) => {
        expect(findLevel(level.id)).toBe(level);
        expect(nextChallenge(level.id)).toBe(set.levels[i + 1]);
      });
    }
    expect(nextChallenge("not-a-level")).toBeUndefined();
  });
});

describe("codexChapters", () => {
  it("gives every chapter its number and tier", () => {
    const listed = codexChapters().filter((entry) => entry.chapter !== 0 || entry.curriculum);
    expect(listed.every((entry) => typeof entry.chapter === "number" && typeof entry.tier === "string")).toBe(true);
  });

  it("puts a tier's challenge sets straight after its last curriculum chapter", () => {
    const order = codexChapters();
    for (const set of challengeSets) {
      const at = order.findIndex((entry) => !entry.curriculum && entry.tier === set.tier && entry.chapter === 0 && entry.levels.length === set.levels.length);
      expect(at).toBeGreaterThan(0);
      const lastOfTier = order.map((entry, i) => (entry.curriculum && entry.tier === set.tier ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
      expect(at).toBeGreaterThan(lastOfTier);
      expect(order.slice(lastOfTier + 1, at).every((entry) => !entry.curriculum && entry.chapter === 0)).toBe(true);
    }
  });
});
