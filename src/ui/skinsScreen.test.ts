import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chapters } from "../content";
import { ProgressStore } from "../progress";
import { memoryStorage } from "../storage.fake";
import { type Fake, fakeDocument } from "./dom.fake";
import { settings } from "../settings";
import { autoCardElement, skinCardElement, skinCards, type SkinCard } from "./skinsScreen";

// The art is drawn with SVG namespaces the Fake document below doesn't have: stand in plain elements.
vi.mock("./svg", () => ({ svg: () => document.createElement("svg") }));
vi.mock("./sprites", () => ({ hero: () => document.createElement("g") }));

const pawnTier = () => chapters.filter((c) => c.curriculum && c.tier === "pawn").at(-1)!;

describe("skinCards", () => {
  afterEach(() => settings.set({ piece: "auto" }));

  it("has the pawn always unlocked, and not worn under Auto, the default", () => {
    const cards = skinCards(new ProgressStore(null));
    expect(cards.map((c) => c.piece)).toEqual(["pawn", "knight"]);
    expect(cards[0]).toMatchObject({ piece: "pawn", name: "Pawn", unlocked: true, worn: false, how: "Yours from the start" });
    expect(cards.some((c) => c.worn)).toBe(false);
  });

  it("marks the chosen skin worn, and only it", () => {
    const store = new ProgressStore(memoryStorage());
    settings.set({ piece: "pawn" });
    expect(skinCards(store).map((c) => c.worn)).toEqual([true, false]);
    for (const level of pawnTier().levels.filter((l) => !l.mastery)) store.update(level.id, { stars: 1 });
    settings.set({ piece: "knight" });
    expect(skinCards(store).map((c) => c.worn)).toEqual([false, true]);
  });

  it("locks the knight, naming the chapter to clear, until the tier is cleared", () => {
    const store = new ProgressStore(memoryStorage());
    const knight = () => skinCards(store).find((card) => card.piece === "knight")!;
    expect(knight()).toMatchObject({ name: "Charger", unlocked: false, worn: false });
    expect(knight().how).toBe(`Clear Chapter ${pawnTier().chapter} · ${pawnTier().title} to unlock`);
    for (const level of pawnTier().levels.filter((l) => !l.mastery)) store.update(level.id, { stars: 1 });
    expect(knight()).toMatchObject({ unlocked: true, how: "Unlocked by the Pawn tier's promotion" });
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
    expect(worn.all("button").length).toBe(0);
    expect(worn.find("worn").length).toBe(1);
  });

  it("has no button on a locked card, and the how line says it is locked", () => {
    const locked = make({ unlocked: false, how: "Clear Chapter 6 to unlock" });
    expect(locked.all("button").length).toBe(0);
    expect(locked.find("locked").length).toBe(1);
    expect(locked.find("skin-locked")[0]!.text).toBe("Locked: clear Chapter 6 to unlock");
  });

  it("offers Wear it on an unlocked skin that isn't worn", () => {
    let wore = 0;
    const open = make({}, () => wore++);
    expect(open.all("button").map((b) => b.text)).toEqual(["Wear it"]);
    expect(open.find("skin-how")[0]!.text).toBe("Unlocked by the Pawn tier's promotion");
    expect(wore).toBe(0);
  });
});

describe("autoCardElement", () => {
  beforeEach(() => vi.stubGlobal("document", fakeDocument));
  afterEach(() => vi.unstubAllGlobals());

  const make = (worn: boolean, onWear = () => {}) => autoCardElement(worn, onWear) as unknown as Fake;

  it("is a focusable skin card for \"auto\" that says its state in words", () => {
    const card = make(true);
    expect(card.attributes.get("tabindex")).toBe("0");
    expect(card.attributes.get("data-piece")).toBe("auto");
    expect(card.attributes.get("aria-label")).toBe("Auto, worn: each level's own piece");
    expect(make(false).attributes.get("aria-label")).toBe("Auto, not worn: each level's own piece");
  });

  it("when worn has the class, the Worn mark and no button", () => {
    const card = make(true);
    expect(card.find("worn").length).toBe(1);
    expect(card.find("skin-worn")[0]!.text).toBe("✓ Worn");
    expect(card.all("button").length).toBe(0);
  });

  it("when not worn offers Wear it, which calls back", () => {
    let wore = 0;
    const card = make(false, () => wore++);
    expect(card.find("worn").length).toBe(0);
    expect(card.all("button").map((b) => b.text)).toEqual(["Wear it"]);
    card.all("button")[0]!.fire("click");
    expect(wore).toBe(1);
  });
});
