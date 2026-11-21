import { afterEach, describe, expect, it } from "vitest";
import { chapters } from "./content";
import { ProgressStore } from "./progress";
import { PROMOTIONS, tierCleared, unlockedPieces, wornPiece } from "./promotion";
import { sanitize, settings } from "./settings";
import { memoryStorage } from "./storage.fake";

const tier = (name: string) => chapters.filter((c) => c.curriculum && c.tier === name).at(-1)!.levels; // the tier's last chapter
const solve = (store: ProgressStore, ids: string[]) => ids.forEach((id) => store.update(id, { stars: 1 }));

describe("promotion", () => {
  it("is earned when every core level of the tier's last chapter is solved, and not before", () => {
    const store = new ProgressStore(memoryStorage());
    const core = tier("pawn").filter((l) => !l.mastery);
    solve(store, core.slice(0, -1).map((l) => l.id));
    expect(tierCleared("pawn", store)).toBe(false);
    solve(store, [core.at(-1)!.id]);
    expect(tierCleared("pawn", store)).toBe(true);
  });

  it("doesn't wait for the optional mastery challenge, or for earlier chapters", () => {
    const store = new ProgressStore(memoryStorage());
    solve(store, tier("pawn").filter((l) => !l.mastery).map((l) => l.id));
    expect(tierCleared("pawn", store)).toBe(true);
    expect(tier("pawn").some((l) => l.mastery && !store.solved(l.id))).toBe(true);
  });

  it("unlocks the knight skin with it, and Reset progress locks it again", () => {
    const store = new ProgressStore(memoryStorage());
    expect(unlockedPieces(store)).toEqual(["pawn"]);
    solve(store, tier("pawn").filter((l) => !l.mastery).map((l) => l.id));
    expect(unlockedPieces(store)).toEqual(["pawn", "knight"]);
    store.reset();
    expect(unlockedPieces(store)).toEqual(["pawn"]);
  });

  it("teases the knight's chapter, no longer saying its levels aren't built", () => {
    expect(PROMOTIONS[0]!.teaser).toBe("The knight moves in an L, over anything in its way. Chapter 7 is waiting.");
  });

  it("is never earned for a tier with no chapters, or outside the curriculum", () => {
    expect(tierCleared("queen", new ProgressStore(memoryStorage()))).toBe(false);
    expect(tierCleared("practice", new ProgressStore(memoryStorage()))).toBe(false);
  });
});

describe("what has been shown once", () => {
  it("remembers a ceremony and a crown, across sessions, until Reset progress", () => {
    const storage = memoryStorage();
    const store = new ProgressStore(storage);
    expect(store.hasSeen("promotion", "pawn")).toBe(false);
    store.markSeen("promotion", "pawn");
    store.markSeen("crown", 2);
    const later = new ProgressStore(storage);
    expect(later.hasSeen("promotion", "pawn") && later.hasSeen("crown", 2)).toBe(true);
    expect(later.hasSeen("crown", 3)).toBe(false);
    later.reset();
    expect(new ProgressStore(storage).hasSeen("promotion", "pawn")).toBe(false);
  });
});

describe("the piece setting", () => {
  it("is auto unless it names a known skin", () => {
    expect(sanitize({}).piece).toBe("auto");
    expect(sanitize({ piece: "knight" }).piece).toBe("knight");
    expect(sanitize({ piece: "dragon" }).piece).toBe("auto");
  });
});

describe("wornPiece", () => {
  const earned = () => {
    const store = new ProgressStore(memoryStorage());
    solve(store, tier("pawn").filter((l) => !l.mastery).map((l) => l.id));
    return store;
  };
  const fresh = () => new ProgressStore(memoryStorage());
  afterEach(() => settings.set({ piece: "auto" }));

  it("under auto is the level's own piece, earned or not", () => {
    settings.set({ piece: "auto" });
    expect(wornPiece(undefined, fresh())).toBe("pawn");
    expect(wornPiece("pawn", fresh())).toBe("pawn");
    expect(wornPiece("knight", fresh())).toBe("knight");
    expect(wornPiece("dragon", fresh())).toBe("pawn");
  });

  it("under auto ignores a name only an object's prototype has", () => {
    settings.set({ piece: "auto" });
    expect(wornPiece("toString", fresh())).toBe("pawn");
    expect(wornPiece("constructor", fresh())).toBe("pawn");
  });

  it("under an explicit knight needs the promotion, on every level", () => {
    settings.set({ piece: "knight" });
    expect(wornPiece(undefined, earned())).toBe("knight");
    expect(wornPiece("pawn", earned())).toBe("knight");
    expect(wornPiece(undefined, fresh())).toBe("pawn");
    expect(wornPiece("knight", fresh())).toBe("pawn");
  });

  it("under an explicit pawn is the pawn everywhere, knight levels too", () => {
    settings.set({ piece: "pawn" });
    expect(wornPiece("knight", earned())).toBe("pawn");
    expect(wornPiece(undefined, earned())).toBe("pawn");
  });
});
