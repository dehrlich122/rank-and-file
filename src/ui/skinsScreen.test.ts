import { describe, expect, it } from "vitest";
import { chapters } from "../content";
import { ProgressStore } from "../progress";
import { memoryStorage } from "../storage.fake";
import { mountSkins, skinCards } from "./skinsScreen";

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
