// The sprite registry: every kind of tile and enemy has a drawing, the hero faces all four ways, both skins draw.
// The tests run without a browser, with a stand-in for the few DOM calls svg() makes.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Facing } from "../../py/protocol";
import { crown, ENEMY_SPRITE, enemy, goal, hero, TILE_SPRITE, tile, type Skin } from "./index";
import { litGrid } from "./floor";

interface Node {
  tag: string;
  attrs: Record<string, string>;
  children: Array<Node | string>;
  setAttribute(name: string, value: string): void;
  append(...nodes: Array<Node | string>): void;
  prepend(...nodes: Array<Node | string>): void;
}

const fake = (tag: string): Node => ({
  tag,
  attrs: {},
  children: [],
  setAttribute(name, value) {
    this.attrs[name] = value;
  },
  append(...nodes) {
    this.children.push(...nodes);
  },
  prepend(...nodes) {
    this.children.unshift(...nodes);
  },
});

/** Everything under a node as text, so two drawings can be compared. */
const text = (node: Node | string): string => (typeof node === "string" ? node : `<${node.tag} ${JSON.stringify(node.attrs)}>${node.children.map(text).join("")}`);

/** Whether a drawing has any line or shape in it. */
const hasShape = (node: Node | string): boolean => typeof node !== "string" && (["path", "polygon", "rect", "circle", "ellipse"].includes(node.tag) || node.children.some(hasShape));

beforeAll(() => {
  vi.stubGlobal("document", { createElementNS: (_ns: string, tag: string) => fake(tag) });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

const draw = (art: unknown) => art as Node;
const FACINGS: Facing[] = ["north", "east", "south", "west"];
const SKINS: Skin[] = ["pawn", "knight"];

describe("the registry", () => {
  it("draws every kind of tile except the floor", () => {
    for (const [kind, name] of Object.entries(TILE_SPRITE)) {
      expect(hasShape(draw(tile(name))), kind).toBe(true);
    }
  });

  it("draws the open gate and the crossed waypoint too", () => {
    expect(hasShape(draw(tile("gateOpen")))).toBe(true);
    expect(text(draw(tile("waypointDone")))).not.toBe(text(draw(tile("waypoint"))));
    expect(text(draw(tile("gateOpen")))).not.toBe(text(draw(tile("gate"))));
  });

  it("draws every kind of enemy, at rest and as it glitches", () => {
    for (const [kind, name] of Object.entries(ENEMY_SPRITE)) {
      for (const frame of ["rest", "break", "snap", "live"] as const) expect(hasShape(draw(enemy(name, frame))), `${kind} ${frame}`).toBe(true);
    }
  });

  it("keeps a broken enemy broken at rest: its rest frame differs from its break frame", () => {
    expect(text(draw(enemy("rook", "rest")))).not.toBe(text(draw(enemy("rook", "break"))));
  });

  it("draws the goal and both crowns", () => {
    for (const art of [goal(), crown(false), crown(true)]) expect(hasShape(draw(art))).toBe(true);
    expect(text(draw(crown(true)))).not.toBe(text(draw(crown(false))));
  });
});

describe("the hero", () => {
  it("faces all four ways, and each looks different", () => {
    for (const skin of SKINS) {
      const looks = FACINGS.map((face) => text(draw(hero(skin, face))));
      expect(new Set(looks).size, skin).toBe(4);
    }
  });

  it("shows its facing in the brackets: the notch turns, and the bright corners are the facing side's", () => {
    const find = (node: Node | string, cls: string): Node[] => (typeof node === "string" ? [] : [...(node.attrs.class === cls ? [node] : []), ...node.children.flatMap((child) => find(child, cls))]);
    const notch = (face: Facing) => find(draw(hero("pawn", face)), "br-notch")[0]!.attrs.transform;
    expect(new Set(FACINGS.map(notch)).size).toBe(4);
    // two corners are bright, and they are not the same two for any pair of facings
    const bright = (face: Facing) => find(draw(hero("pawn", face)), "br-facing")[0]!.attrs.d!;
    expect(new Set(FACINGS.map(bright)).size).toBe(4);
  });

  it("draws both skins differently", () => {
    expect(text(draw(hero("pawn", "east")))).not.toBe(text(draw(hero("knight", "east"))));
  });

  it("can leave the brackets off", () => {
    expect(text(draw(hero("pawn", "east", false)))).not.toContain("br-facing");
  });
});

describe("the floor", () => {
  it("draws the grid for a board of any size: lines between squares, a tick at every crossing", () => {
    const grid = draw(litGrid(3, 2));
    const [lines, ticks] = grid.children as Node[];
    expect(lines!.attrs.d!.match(/M/g)).toHaveLength(2 + 1); // two inner columns and one inner row
    expect(ticks!.attrs.d!.match(/M/g)).toHaveLength(4 * 3 * 2); // 4 by 3 crossings, a horizontal and a vertical tick each
  });
});
