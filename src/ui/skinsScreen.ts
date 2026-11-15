// Free Play's Skins gallery (M4.4): each piece skin large, whether it is unlocked and by what, and a button to wear
// it (the same setting as Settings → Piece).
import { chapterName } from "../content";
import { lastChapterOf, PROMOTIONS, SKIN_NAMES, tierCleared, wornPiece } from "../promotion";
import { progress, type ProgressStore } from "../progress";
import { settings, type Piece } from "../settings";
import { h } from "./dom";
import { hero } from "./sprites";
import { svg } from "./svg";

export interface SkinCard {
  piece: Piece;
  name: string;
  unlocked: boolean;
  worn: boolean;
  how: string;
}

const lc = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** One skin's card: its art, name, status and how it is earned; a button to wear it when it can be. */
export function skinCardElement(card: SkinCard, onWear: () => void): HTMLElement {
  const art = svg("svg", { viewBox: "-38 -38 76 76", width: 120, height: 120, role: "img", "aria-label": `The ${card.name}` }, hero(card.piece, card.piece === "knight" ? "east" : "south"));
  const state = card.worn ? "worn" : card.unlocked ? "not worn" : "locked";
  return h(
    "div",
    {
      class: `skin-card${card.worn ? " worn" : ""}${card.unlocked ? "" : " locked"}`,
      tabindex: "0",
      "aria-label": `${card.name}, ${state}: ${lc(card.how)}`,
      "data-piece": card.piece,
    },
    h("div", { class: "skin-art" }, art),
    h("strong", {}, card.name),
    h("span", { class: `muted small skin-how${card.unlocked ? "" : " skin-locked"}` }, card.unlocked ? card.how : `Locked: ${lc(card.how)}`),
    card.worn && h("span", { class: "skin-status skin-worn" }, h("span", { "aria-hidden": "true" }, "✓ "), "Worn"),
    card.unlocked && !card.worn && h("button", { class: "btn btn-small", onClick: onWear }, "Wear it"),
  );
}

/** The pawn, then the skin each promotion earns. */
export function skinCards(store: ProgressStore = progress): SkinCard[] {
  const worn = wornPiece(store);
  const cards: SkinCard[] = [{ piece: "pawn", name: SKIN_NAMES.pawn, unlocked: true, worn: worn === "pawn", how: "Yours from the start" }];
  for (const promotion of PROMOTIONS) {
    const unlocked = tierCleared(promotion.tier, store);
    const last = lastChapterOf(promotion.tier);
    cards.push({
      piece: promotion.to,
      name: SKIN_NAMES[promotion.to],
      unlocked,
      worn: worn === promotion.to,
      how: unlocked ? `Unlocked by the ${promotion.tier[0]!.toUpperCase()}${promotion.tier.slice(1)} tier's promotion` : `Clear ${last ? chapterName(last) : "its chapter"} to unlock`,
    });
  }
  return cards;
}

/** Mount the Skins gallery in `main`. Returns what to call to leave it. */
export function mountSkins(main: HTMLElement, store: ProgressStore = progress): () => void {
  const grid = h("div", { class: "skins" });
  const paint = () => {
    // "Wear it" repaints the grid: keep keyboard focus on the card now worn rather than losing it to the page
    const hadFocus = grid.contains(document.activeElement);
    grid.replaceChildren(
      ...skinCards(store).map((card) => skinCardElement(card, () => settings.set({ piece: card.piece }))),
    );
    if (hadFocus) grid.querySelector<HTMLElement>(".skin-card.worn")?.focus();
  };
  paint();
  main.replaceChildren(
    h("div", { class: "free-play" }, h("h1", { class: "lessons-title" }, "Skins"), h("p", { class: "muted skins-intro" }, "Skins change how your piece looks. Promotions unlock them."), grid),
  );
  return settings.subscribe(paint);
}
