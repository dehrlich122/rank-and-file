// The promotion ceremony (M3.7, DESIGN.md §8): a full-screen moment, not a pop-up, that closes a tier. It
// celebrates, sums up what the player learned in the tier, shows the new piece and teases the next tier.
// It shows once, automatically, when the tier's core levels are solved; Lessons can replay it.
import { chapters } from "../content";
import type { ProgressStore } from "../progress";
import { PROMOTIONS, tierCleared } from "../promotion";
import type { SettingsStore } from "../settings";
import { h } from "./dom";
import { hero } from "./sprites";
import { svg } from "./sprites/svg";

/** Mount the ceremony for `tier`. Without a promotion earned there is nothing to show, so it goes back to Lessons. */
export function mountPromotion(main: HTMLElement, tier: string, progress: ProgressStore, settings: SettingsStore): () => void {
  const promotion = PROMOTIONS.find((p) => p.tier === tier);
  if (!promotion || !tierCleared(tier, progress)) {
    location.hash = "#/lessons";
    return () => {};
  }
  progress.markSeen("promotion", tier);

  const learned = chapters.filter((c) => c.curriculum && c.tier === tier);
  const figure = (piece: typeof promotion.from, className: string) => svg("svg", { viewBox: "-38 -38 76 76", class: `pr-piece ${className}`, "aria-hidden": "true" }, hero(piece, piece === "knight" ? "east" : "south"));
  const wear = h("button", { class: "btn btn-small" }, `Wear the ${promotion.to} skin`);
  const wearing = () => settings.get().piece === promotion.to;
  const paint = () => {
    wear.textContent = wearing() ? `Wearing the ${promotion.to}: switch back to the ${promotion.from}` : `Wear the ${promotion.to} skin`;
  };
  wear.addEventListener("click", () => {
    settings.set({ piece: wearing() ? promotion.from : promotion.to });
    paint();
  });
  paint();

  main.replaceChildren(
    h(
      "section",
      { class: "title-scene promotion", "aria-label": "Promotion" },
      h("div", { class: "ts-sky", "aria-hidden": "true" }, h("div", { class: "ts-sun" }), h("div", { class: "ts-floor" }), h("div", { class: "ts-vhs" })),
      h(
        "div",
        { class: "ts-body pr-body" },
        h("p", { class: "pr-kicker" }, "Tier cleared"),
        h("h1", { class: "ts-logo" }, h("span", { class: "ts-logo-text pr-title", "data-text": "PROMOTION" }, "PROMOTION")),
        h("div", { class: "pr-stage", role: "img", "aria-label": `Your ${promotion.from} becomes a ${promotion.to}` }, figure(promotion.from, "pr-from"), h("span", { class: "pr-arrow", "aria-hidden": "true" }, "▶"), figure(promotion.to, "pr-to")),
        h("p", { class: "pr-headline" }, promotion.headline),
        h(
          "div",
          { class: "pr-card" },
          h("h2", {}, "What you learned"),
          h("ul", {}, ...learned.map((chapter) => h("li", {}, h("strong", {}, chapter.title), ` ${chapter.summary}`))),
          h("p", { class: "muted small" }, "Every function you used is in the Codex tab on any level."),
        ),
        h("p", { class: "pr-teaser" }, promotion.teaser),
        h("div", { class: "pr-actions" }, h("a", { class: "btn btn-primary", href: "#/lessons" }, "Back to Lessons"), wear),
      ),
    ),
  );
  return () => {};
}
