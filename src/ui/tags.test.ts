import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asFake as make, fakeDocument } from "./dom.fake";
import { DIFFICULTY_WORDS, difficultyTag, problemTag, tierTag } from "./tags";


beforeEach(() => vi.stubGlobal("document", fakeDocument));
afterEach(() => vi.unstubAllGlobals());

describe("difficultyTag", () => {
  it("names the keyword, the step and the label", () => {
    DIFFICULTY_WORDS.forEach((word, i) => {
      const tag = make(difficultyTag(i + 1));
      expect(tag.attributes.get("data-step")).toBe(String(i + 1));
      expect(tag.attributes.get("aria-label")).toBe(`Difficulty ${i + 1} of 5: ${word}`);
      expect(tag.attributes.get("role")).toBe("img");
      expect(tag.children.some((k) => typeof k !== "string" && k.tag === "code" && k.text === word)).toBe(true);
    });
  });
  it("fills pips up to the step", () => {
    const tag = make(difficultyTag(3));
    expect(tag.find("diff-pip").length).toBe(5);
    expect(tag.find("on").length).toBe(3);
    expect(tag.find("diff-pips")[0]!.attributes.get("aria-hidden")).toBe("true");
  });
  it("refuses steps outside 1 to 5", () => {
    expect(() => difficultyTag(0)).toThrow();
    expect(() => difficultyTag(6)).toThrow();
  });
});

describe("problemTag", () => {
  it("says in words that the level has problems, and is not a tier tag's text", () => {
    const tag = make(problemTag());
    expect(tag.text).toBe("has problems");
    expect(tag.find("problem-tag").length).toBe(1);
    expect(tag.attributes.get("title")?.includes("editor")).toBe(true);
  });
});

describe("tierTag", () => {
  it("capitalises the tier", () => {
    const tag = make(tierTag("knight"));
    expect(tag.text).toBe("♟ Knight");
    expect(tag.attributes.get("title")).toBe("Needs what the Knight tier teaches");
  });
});
