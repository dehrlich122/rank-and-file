// The satchel: one row per key in the order carried, empty slots up to eight, and what a screen reader hears.
// The tests run without a browser, with a stand-in for the few DOM calls h() and svg() make.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SatchelView } from "./satchel";

// An element is its tag, its attributes and its children; text stays a string.
class Fake {
  attrs: Record<string, string> = {};
  children: Array<Fake | string> = [];
  constructor(readonly tag: string) {}
  setAttribute(name: string, value: string) {
    this.attrs[name] = value;
  }
  append(...kids: Array<Fake | string>) {
    this.children.push(...kids);
  }
  replaceChildren(...kids: Array<Fake | string>) {
    this.children = kids;
  }
}
type Node = Fake;

beforeAll(() => void vi.stubGlobal("document", { createElement: (tag: string) => new Fake(tag), createElementNS: (_ns: string, tag: string) => new Fake(tag) }));
afterAll(() => void vi.unstubAllGlobals());

function* walk(node: Node): Generator<Node> {
  yield node;
  for (const kid of node.children) if (typeof kid !== "string") yield* walk(kid);
}
const withClass = (node: Node, cls: string) => [...walk(node)].filter((n) => (n.attrs.class ?? "").split(" ").includes(cls));
const words = (node: Node | string): string => (typeof node === "string" ? node : node.children.map(words).join(""));
const view = (keys: Array<string | number>) => {
  const satchel = new SatchelView();
  satchel.show(keys);
  return satchel.element as unknown as Node;
};
const rows = (box: Node) => withClass(box, "satchel-chip");
const slots = (box: Node) => withClass(box, "satchel-slot");
const head = (box: Node) => words(withClass(box, "satchel-head")[0]!);

describe("the satchel", () => {
  it("starts empty: eight slots and 0 of 8", () => {
    const box = view([]);
    expect(rows(box).length).toBe(0);
    expect(slots(box).length).toBe(8);
    expect(head(box)).toBe("Satchel0 of 8");
  });

  it("is empty before it is shown anything", () => {
    const box = new SatchelView().element as unknown as Node;
    expect(slots(box).length).toBe(8);
  });

  it("lists the keys in order, a text name and a number, and keeps the rest as slots", () => {
    const box = view(["brass", 12]);
    expect(rows(box).map((r) => words(withClass(r, "satchel-chip-name")[0]!))).toEqual(["brass", "12"]);
    expect(slots(box).length).toBe(6);
    expect(head(box)).toBe("Satchel2 of 8");
  });

  it("is full with eight keys: no slot is left", () => {
    const box = view([7, 12, 3, 41, 9, 25, 16, 8]);
    expect(rows(box).length).toBe(8);
    expect(slots(box).length).toBe(0);
    expect(head(box)).toBe("Satchel8 of 8");
  });

  it("shows every key past eight, with no slots and a plain count", () => {
    const box = view([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(rows(box).length).toBe(9);
    expect(slots(box).length).toBe(0);
    expect(head(box)).toBe("Satchel9");
  });

  it("replaces what it held when shown fewer keys (a rewind)", () => {
    const satchel = new SatchelView();
    satchel.show(["brass", "iron"]);
    satchel.show(["brass"]);
    const box = satchel.element as unknown as Node;
    expect(rows(box).length).toBe(1);
    expect(withClass(box, "satchel").length).toBe(1);
    expect(slots(box).length).toBe(7);
    expect(head(box)).toBe("Satchel1 of 8");
  });

  it("is labelled for a screen reader, and hides what only decorates", () => {
    const box = view(["brass"]);
    expect(withClass(box, "satchel")[0]!.attrs["aria-label"]).toBe("The satchel");
    expect(slots(box).every((s) => s.attrs["aria-hidden"] === "true")).toBe(true);
    expect(withClass(box, "satchel-glyph").every((g) => g.attrs["aria-hidden"] === "true")).toBe(true);
    expect(withClass(box, "satchel-glyph").length).toBe(1);
  });
});
