// Tiers, promotions and the skins they unlock (DESIGN.md §8). A tier is cleared when the core levels of
// all its chapters are solved (the mastery challenges stay optional); clearing one earns its promotion.
// What is unlocked is worked out from the saved progress, so Reset progress locks it again.
import { chapters } from "./content";
import { progress, type ProgressStore } from "./progress";
import { settings, type Piece } from "./settings";

export interface Promotion {
  tier: string; // the chapters' `tier` in chapters.yaml
  from: Piece;
  to: Piece;
  /** The ceremony's lines (chrome, so they may have a voice). */
  headline: string;
  teaser: string;
}

export const PROMOTIONS: Promotion[] = [
  {
    tier: "pawn",
    from: "pawn",
    to: "knight",
    headline: "Promoted: pawn to knight",
    teaser: "The knight moves in an L, over anything in its way. Its levels aren't built yet; wear its armour in Settings → Piece while you wait.",
  },
];

/** Every core level of every curriculum chapter in `tier` is solved. */
export function tierCleared(tier: string, store: ProgressStore = progress): boolean {
  const core = chapters.filter((chapter) => chapter.curriculum && chapter.tier === tier).flatMap((chapter) => chapter.levels.filter((level) => !level.mastery));
  return core.length > 0 && core.every((level) => store.solved(level.id));
}

/** The pieces whose promotion has been earned, and the pawn, which everyone has. */
export function unlockedPieces(store: ProgressStore = progress): Piece[] {
  return ["pawn", ...PROMOTIONS.filter((p) => tierCleared(p.tier, store)).map((p) => p.to)];
}

/** The skin to draw: the one chosen in Settings → Piece, if its promotion is earned, else the pawn. */
export function wornPiece(store: ProgressStore = progress): Piece {
  const chosen = settings.get().piece;
  return unlockedPieces(store).includes(chosen) ? chosen : "pawn";
}
