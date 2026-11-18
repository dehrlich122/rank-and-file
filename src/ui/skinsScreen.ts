// Free Play's Skins gallery (M4.4): each piece skin large, whether it is unlocked and by what, and a button to wear
// it (the same setting as Settings → Piece).
import { chapterName } from "../content";
import { lastChapterOf, PROMOTIONS, SKIN_NAMES, tierCleared, wornPiece } from "../promotion";
import { progress, type ProgressStore } from "../progress";
import { settings, type Piece } from "../settings";
import { h } from "./dom";
import { tierLabel } from "./tags";
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

interface CardParts {
  piece: string; // data-piece: a skin, or "auto"
  title: string;
  how: string; // the line under the title
  howClass: string;
  state: "worn" | "not worn" | "locked";
  aria: string; // what the card is, before its state
  ariaHow: string;
  art: Element;
  onWear: () => void;
}

/** The shape every card shares: art, title, a line, then the Worn mark or a button to wear it (not when locked). */
function cardElement(c: CardParts): HTMLElement {
  return h(
    "div",
    {
      class: `skin-card${c.state === "worn" ? " worn" : ""}${c.state === "locked" ? " locked" : ""}`,
      tabindex: "0",
      "aria-label": `${c.aria}, ${c.state}: ${c.ariaHow}`,
      "data-piece": c.piece,
    },
    h("div", { class: "skin-art" }, c.art),
    h("strong", {}, c.title),
    h("span", { class: c.howClass }, c.how),
    c.state === "worn" && h("span", { class: "skin-worn" }, h("span", { "aria-hidden": "true" }, "✓ "), "Worn"),
    c.state === "not worn" && h("button", { class: "btn btn-small", onClick: c.onWear }, "Wear it"),
  );
}

/** One skin's card: its art, name, status and how it is earned; a button to wear it when it can be. */
export function skinCardElement(card: SkinCard, onWear: () => void): HTMLElement {
  return cardElement({
    piece: card.piece,
    title: card.name,
    how: card.unlocked ? card.how : `Locked: ${lc(card.how)}`,
    howClass: `muted small skin-how${card.unlocked ? "" : " skin-locked"}`,
    state: card.worn ? "worn" : card.unlocked ? "not worn" : "locked",
    aria: card.name,
    ariaHow: lc(card.how),
    art: svg("svg", { viewBox: "-38 -38 76 76", width: 120, height: 120, role: "img", "aria-label": `The ${card.name}` }, hero(card.piece, card.piece === "knight" ? "east" : "south")),
    onWear,
  });
}

/** The Auto card: each level's own piece, the pawn and the knight side by side. Worn while the setting is "auto". */
export function autoCardElement(worn: boolean, onWear: () => void): HTMLElement {
  const piece = (kind: Piece, x: number) => svg("g", { transform: `translate(${x} 0)` }, hero(kind, kind === "knight" ? "east" : "south"));
  return cardElement({
    piece: "auto",
    title: "Auto: each level's own piece",
    how: "The Pawn on the Pawn tier's levels, the Knight on the Knight tier's",
    howClass: "muted small skin-how",
    state: worn ? "worn" : "not worn",
    aria: "Auto",
    ariaHow: "each level's own piece",
    art: svg("svg", { viewBox: "-76 -38 152 76", width: 190, height: 95, role: "img", "aria-label": "The Pawn and the Knight" }, piece("pawn", -38), piece("knight", 38)),
    onWear,
  });
}

/** The pawn, then the skin each promotion earns. Skins only: the Auto card is not one (the hub counts these). */
export function skinCards(store: ProgressStore = progress): SkinCard[] {
  const worn = settings.get().piece === "auto" ? undefined : wornPiece(undefined, store); // under Auto, no skin is worn
  const cards: SkinCard[] = [{ piece: "pawn", name: SKIN_NAMES.pawn, unlocked: true, worn: worn === "pawn", how: "Yours from the start" }];
  for (const promotion of PROMOTIONS) {
    const unlocked = tierCleared(promotion.tier, store);
    const last = lastChapterOf(promotion.tier);
    cards.push({
      piece: promotion.to,
      name: SKIN_NAMES[promotion.to],
      unlocked,
      worn: worn === promotion.to,
      how: unlocked ? `Unlocked by the ${tierLabel(promotion.tier)} tier's promotion` : `Clear ${last ? chapterName(last) : "its chapter"} to unlock`,
    });
  }
  return cards;
}

/** Mount the Skins gallery in `main`. Returns what to call to leave it. */
export function mountSkins(main: HTMLElement): () => void {
  const grid = h("div", { class: "skins" });
  const paint = () => {
    // "Wear it" repaints the grid: keep keyboard focus on the card now worn rather than losing it to the page
    const hadFocus = grid.contains(document.activeElement);
    grid.replaceChildren(
      autoCardElement(settings.get().piece === "auto", () => settings.set({ piece: "auto" })),
      ...skinCards().map((card) => skinCardElement(card, () => settings.set({ piece: card.piece }))),
    );
    if (hadFocus) grid.querySelector<HTMLElement>(".skin-card.worn")?.focus();
  };
  paint();
  main.replaceChildren(
    h("div", { class: "free-play" }, h("h1", { class: "lessons-title" }, "Skins"), h("p", { class: "muted skins-intro" }, "Skins change how your piece looks. Promotions unlock them."), grid),
  );
  return settings.subscribe(paint);
}
