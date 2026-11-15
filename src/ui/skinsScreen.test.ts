import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chapters } from "../content";
import { ProgressStore } from "../progress";
import { memoryStorage } from "../storage.fake";
import { type Fake, fakeDocument } from "./dom.fake";
import { mountSkins, skinCardElement, skinCards, type SkinCard } from "./skinsScreen";

// The art is drawn with SVG namespaces the Fake document below doesn't have: stand in plain elements.
vi.mock("./svg", () => ({ svg: () => document.createElement("svg") }));
vi.mock("./sprites", () => ({ hero: () => document.createElement("g") }));

const pawnTier = () => chapters.filter((c) => c.curriculum && c.tier === "pawn").at(-1)!;

describe("skinCards", () => {
  it("has the pawn always unlocked, and worn by default", () => {
    const [pawn] = skinCards(new ProgressStore(null));
    expect(pawn).toMatchObject({ piece: "pawn", name: "Pawn", unlocked: true, worn: true, how: "Yours from the start" });
  });

  it("locks the knight, naming the chapter to clear, until the tier is cleared", () => {
    const store = new ProgressStore(memoryStorage());
    const knight = () => skinCards(store).find((card) => card.piece === "knight")!;
    expect(knight()).toMatchObject({ name: "Charger", unlocked: false, worn: false });
    expect(knight().how).toBe(`Clear Chapter ${pawnTier().chapter} · ${pawnTier().title} to unlock`);
    for (const level of pawnTier().levels.filter((l) => !l.mastery)) store.update(level.id, { stars: 1 });
    expect(knight()).toMatchObject({ unlocked: true, how: "Unlocked by the Pawn tier's promotion" });
  });

  it("is mounted by the Free Play route", () => {
    expect(typeof mountSkins).toBe("function");
  });
});

describe("skinCardElement", () => {
  beforeEach(() => vi.stubGlobal("document", fakeDocument));
  afterEach(() => vi.unstubAllGlobals());

  const card = (over: Partial<SkinCard>): SkinCard => ({ piece: "knight", name: "Charger", unlocked: true, worn: false, how: "Unlocked by the Pawn tier's promotion", ...over });
  const make = (over: Partial<SkinCard>, onWear = () => {}) => skinCardElement(card(over), onWear) as unknown as Fake;

  it("can be focused, and says its state in words", () => {
    const worn = make({ worn: true });
    expect(worn.attributes.get("tabindex")).toBe("0");
    expect(worn.attributes.get("aria-label")).toBe("Charger, worn: unlocked by the Pawn tier's promotion");
    expect(make({}).attributes.get("aria-label")).toBe("Charger, not worn: unlocked by the Pawn tier's promotion");
    expect(make({ unlocked: false, how: "Clear Chapter 6 to unlock" }).attributes.get("aria-label")).toBe("Charger, locked: clear Chapter 6 to unlock");
  });

  it("marks the worn skin with a word and no button", () => {
    const worn = make({ worn: true });
    expect(worn.find("skin-worn")[0]!.text).toBe("✓ Worn");
    expect(worn.buttons().length).toBe(0);
    expect(worn.find("worn").length).toBe(1);
  });

  it("has no button on a locked card, and the how line says it is locked", () => {
    const locked = make({ unlocked: false, how: "Clear Chapter 6 to unlock" });
    expect(locked.buttons().length).toBe(0);
    expect(locked.find("locked").length).toBe(1);
    expect(locked.find("skin-locked")[0]!.text).toBe("Locked: clear Chapter 6 to unlock");
  });

  it("offers Wear it on an unlocked skin that isn't worn", () => {
    let wore = 0;
    const open = make({}, () => wore++);
    expect(open.buttons().map((b) => b.text)).toEqual(["Wear it"]);
    expect(open.find("skin-how")[0]!.text).toBe("Unlocked by the Pawn tier's promotion");
    expect(wore).toBe(0);
  });
});
