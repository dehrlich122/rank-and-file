// The key and the door: what a tile holds (names, tooltips) and which doors stand open for the keys carried.
// The tests run without a browser, with a stand-in for the few DOM calls svg() makes.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { doorTile, keyTile, openDoors } from "./keyDoor";

type Node = { tag: string; attrs: Record<string, string>; children: Array<Node | string>; textContent?: string; setAttribute: (n: string, v: string) => void; append: (...kids: Array<Node | string>) => void };

const fake = (tag: string): Node => {
  const node: Node = { tag, attrs: {}, children: [], setAttribute: (n, v) => void (node.attrs[n] = v), append: (...kids) => void node.children.push(...kids) };
  return node;
};

beforeAll(() => {
  vi.stubGlobal("document", { createElementNS: (_ns: string, tag: string) => fake(tag) });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

const all = (node: Node | string): Node[] => (typeof node === "string" ? [] : [node, ...node.children.flatMap(all)]);
const withClass = (node: Node, cls: string) => all(node).filter((n) => n.attrs.class?.split(" ").includes(cls));
const words = (node: Node | string): string => (typeof node === "string" ? node : node.children.map(words).join(""));
const names = (node: Node) => withClass(node, "name").map(words);
const tip = (node: Node) => all(node).find((n) => n.tag === "title")!.textContent;

describe("the key tile", () => {
  it("carries its name along the edge, and says how to take it", () => {
    const key = keyTile(0, 0, "brass") as unknown as Node;
    expect(key.attrs.class).toBe("key");
    expect(names(key)).toEqual(["brass"]);
    expect(withClass(key, "edge-name").length).toBe(1);
    expect(tip(key)).toBe("The brass key. Stand on its stone and call pick_up().");
  });

  it("writes a number as a number", () => {
    const key = keyTile(0, 0, 12) as unknown as Node;
    expect(names(key)).toEqual(["12"]);
    expect(tip(key)).toBe("Key 12. Stand on its stone and call pick_up().");
  });
});

describe("the door tile", () => {
  it("holds a locked and an open drawing, each with the name on its capsule", () => {
    const door = doorTile(0, 0, "brass") as unknown as Node;
    expect(door.attrs.class).toBe("door");
    expect(withClass(door, "door-locked").length).toBe(1);
    expect(withClass(door, "door-open").length).toBe(1);
    expect(names(door)).toEqual(["brass", "brass"]);
    expect(tip(door)).toBe("A locked door. It opens for a knight carrying the brass key.");
  });

  it("names a numbered key in its tooltip", () => {
    expect(tip(doorTile(0, 0, 12) as unknown as Node)).toBe("A locked door. It opens for a knight carrying key 12.");
  });
});

describe("which doors stand open", () => {
  const doors = [
    { pos: [2, 3] as [number, number], key: "brass" },
    { pos: [4, 1] as [number, number], key: 12 },
  ];

  it("opens a door while its key is carried, and no other", () => {
    expect(JSON.stringify(openDoors(doors, ["brass"]))).toBe("[[2,3]]");
    expect(JSON.stringify(openDoors(doors, [12, "brass"]))).toBe("[[2,3],[4,1]]");
  });

  it("opens none with nothing carried, no inventory, or no doors", () => {
    expect(openDoors(doors, []).length).toBe(0);
    expect(openDoors(doors, undefined).length).toBe(0);
    expect(openDoors(undefined, ["brass"]).length).toBe(0);
  });
});
