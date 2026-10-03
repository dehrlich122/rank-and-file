// Tiers, promotions and the skins they unlock (DESIGN.md §8). A tier's promotion is earned by clearing its
// last chapter: the five core levels solved (the mastery challenge stays optional). Nothing is locked, so
// earlier chapters may be skipped, and they don't hold the promotion back.
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

/** The chapter that closes `tier`: clearing it earns the promotion. */
export const lastChapterOf = (tier: string) => chapters.filter((chapter) => chapter.curriculum && chapter.tier === tier).at(-1);

/** Every core level of the tier's last chapter is solved. */
export function tierCleared(tier: string, store: ProgressStore = progress): boolean {
  const last = lastChapterOf(tier);
  const core = last?.levels.filter((level) => !level.mastery) ?? [];
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
