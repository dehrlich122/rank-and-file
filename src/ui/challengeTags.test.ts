import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { levelTagsRow } from "./challengeTags";
import { type Fake, fakeDocument } from "./dom.fake";

const rows = (...args: Parameters<typeof levelTagsRow>) => levelTagsRow(...args) as unknown as Fake[];


beforeEach(() => vi.stubGlobal("document", fakeDocument));
afterEach(() => vi.unstubAllGlobals());

describe("levelTagsRow", () => {
  it("shows a challenge's tier and difficulty, then its chapters as links to Lessons", () => {
    const [tags, drawsOn] = rows({ difficulty: 4, draws_on: [3, 5] }, "pawn", true);
    expect(tags!.attributes.get("class")).toBe("tags");
    expect(tags!.find("tier-tag")[0]!.text).toBe("♟ Pawn");
    expect(tags!.find("diff-tag")[0]!.attributes.get("data-step")).toBe("4");
    expect(drawsOn!.find("draws-on-label")[0]!.text).toBe("Draws on");
    const chips = drawsOn!.find("chapter-chip");
    expect(chips.map((chip) => chip.attributes.get("href"))).toEqual(["#/lessons/3", "#/lessons/5"]);
    expect(chips[0]!.text.startsWith("Chapter 3 · ")).toBe(true);
  });

  it("skips chapters that don't exist, and the line when none do", () => {
    const [, drawsOn] = rows({ difficulty: 2, draws_on: [1, 999] }, "pawn", true);
    expect(drawsOn!.find("chapter-chip").length).toBe(1);
    expect(rows({ difficulty: 2, draws_on: [999] }, "pawn", true).length).toBe(1);
  });

  it("shows the difficulty alone while the tier is unknown or the engine had none", () => {
    const [tags] = rows({ difficulty: 1, draws_on: [] }, null, false);
    expect(tags!.find("tier-tag").length).toBe(0);
    expect(tags!.find("diff-tag").length).toBe(1);
  });

  it("gives a test-played or shared level its tier, and no chips", () => {
    const shown = rows({ difficulty: 3, draws_on: [1] }, "knight", false);
    expect(shown.length).toBe(1);
    expect(shown[0]!.find("tier-tag")[0]!.text).toBe("♟ Knight");
  });

  it("is empty for a level with nothing to say", () => {
    expect(rows({ difficulty: null, draws_on: [] }, null, false)).toEqual([]);
    expect(rows({ difficulty: null, draws_on: [] }, null, true)).toEqual([]);
  });
});
