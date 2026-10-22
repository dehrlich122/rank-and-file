import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { levelTagsRow } from "./challengeTags";

// Vitest runs in Node here, so stand in a document that keeps what h() sets: tag, attributes and children.
type Fake = { attrs: Map<string, string>; kids: Array<Fake | string>; text: string; find(cls: string): Fake[] };
function fake(): Fake {
  const node: Fake = {
    attrs: new Map(),
    kids: [],
    get text() {
      return node.kids.map((kid) => (typeof kid === "string" ? kid : kid.text)).join("");
    },
    find: (cls) => [...(node.attrs.get("class")?.split(" ").includes(cls) ? [node] : []), ...node.kids.flatMap((kid) => (typeof kid === "string" ? [] : kid.find(cls)))],
  };
  return Object.assign(node, {
    setAttribute: (name: string, value: string) => void node.attrs.set(name, value),
    addEventListener: () => {},
    append: (...nodes: Array<Fake | string>) => void node.kids.push(...nodes),
  });
}
const rows = (...args: Parameters<typeof levelTagsRow>) => levelTagsRow(...args) as unknown as Fake[];

beforeEach(() => vi.stubGlobal("document", { createElement: fake }));
afterEach(() => vi.unstubAllGlobals());

describe("levelTagsRow", () => {
  it("shows a challenge's tier and difficulty, then its chapters as links to Lessons", () => {
    const [tags, drawsOn] = rows({ difficulty: 4, draws_on: [3, 5] }, "challenge", "pawn");
    expect(tags!.attrs.get("class")).toBe("tags");
    expect(tags!.find("tier-tag")[0]!.text).toBe("♟ Pawn");
    expect(tags!.find("diff-tag")[0]!.attrs.get("data-step")).toBe("4");
    expect(drawsOn!.find("draws-on-label")[0]!.text).toBe("Draws on");
    const chips = drawsOn!.find("chapter-chip");
    expect(chips.map((chip) => chip.attrs.get("href"))).toEqual(["#/lessons/3", "#/lessons/5"]);
    expect(chips[0]!.text.startsWith("Chapter 3 · ")).toBe(true);
  });

  it("skips chapters that don't exist, and the line when none do", () => {
    const [, drawsOn] = rows({ difficulty: 2, draws_on: [1, 999] }, "challenge", "pawn");
    expect(drawsOn!.find("chapter-chip").length).toBe(1);
    expect(rows({ difficulty: 2, draws_on: [999] }, "challenge", "pawn").length).toBe(1);
  });

  it("shows the difficulty alone while the tier is unknown or the engine had none", () => {
    const [tags] = rows({ difficulty: 1, draws_on: [] }, "testPlay", null);
    expect(tags!.find("tier-tag").length).toBe(0);
    expect(tags!.find("diff-tag").length).toBe(1);
  });

  it("gives a test-played or shared level its tier, and no chips", () => {
    for (const kind of ["testPlay", "shared"] as const) {
      const shown = rows({ difficulty: 3, draws_on: [1] }, kind, "knight");
      expect(shown.length).toBe(1);
      expect(shown[0]!.find("tier-tag")[0]!.text).toBe("♟ Knight");
    }
  });

  it("gives a lesson level its difficulty if the file has one, but never a tier", () => {
    const [tags] = rows({ difficulty: 2, draws_on: [] }, "lesson", "pawn");
    expect(tags!.find("tier-tag").length).toBe(0);
    expect(tags!.find("diff-tag").length).toBe(1);
  });

  it("is empty for a level with nothing to say", () => {
    expect(rows({ difficulty: null, draws_on: [] }, "lesson", null)).toEqual([]);
    expect(rows({ difficulty: null, draws_on: [] }, "shared", null)).toEqual([]);
  });
});
