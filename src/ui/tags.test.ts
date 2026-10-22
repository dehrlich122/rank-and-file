import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DIFFICULTY_WORDS, difficultyTag, tierTag } from "./tags";

// Vitest runs in Node here, so stand in a document that keeps what h() sets: tag, attributes and children.
class Fake {
  attrs = new Map<string, string>();
  kids: Array<Fake | string> = [];
  constructor(readonly tag: string) {}
  setAttribute(name: string, value: string) {
    this.attrs.set(name, value);
  }
  addEventListener() {}
  append(...nodes: Array<Fake | string>) {
    this.kids.push(...nodes);
  }
  get text(): string {
    return this.kids.map((k) => (typeof k === "string" ? k : k.text)).join("");
  }
  find(cls: string): Fake[] {
    const own = this.attrs.get("class")?.split(" ").includes(cls) ? [this] : [];
    return [...own, ...this.kids.filter((k): k is Fake => typeof k !== "string").flatMap((k) => k.find(cls))];
  }
}
const make = (el: HTMLElement) => el as unknown as Fake;

beforeEach(() => vi.stubGlobal("document", { createElement: (tag: string) => new Fake(tag) }));
afterEach(() => vi.unstubAllGlobals());

describe("difficultyTag", () => {
  it("names the keyword, the step and the label", () => {
    DIFFICULTY_WORDS.forEach((word, i) => {
      const tag = make(difficultyTag(i + 1));
      expect(tag.attrs.get("data-step")).toBe(String(i + 1));
      expect(tag.attrs.get("aria-label")).toBe(`Difficulty ${i + 1} of 5: ${word}`);
      expect(tag.attrs.get("role")).toBe("img");
      expect(tag.kids.some((k) => typeof k !== "string" && k.tag === "code" && k.text === word)).toBe(true);
    });
  });
  it("fills pips up to the step", () => {
    const tag = make(difficultyTag(3));
    expect(tag.find("diff-pip").length).toBe(5);
    expect(tag.find("on").length).toBe(3);
    expect(tag.find("diff-pips")[0]!.attrs.get("aria-hidden")).toBe("true");
  });
  it("refuses steps outside 1 to 5", () => {
    expect(() => difficultyTag(0)).toThrow();
    expect(() => difficultyTag(6)).toThrow();
  });
});

describe("tierTag", () => {
  it("capitalises the tier", () => {
    const tag = make(tierTag("knight"));
    expect(tag.text).toBe("♟ Knight");
    expect(tag.attrs.get("title")).toBe("Needs what the Knight tier teaches");
  });
});
