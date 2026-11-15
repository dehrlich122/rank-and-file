// The two tags a Free Play level carries (M4.4): its tier and its difficulty. The CSS is in free.css.
import { h } from "./dom";

/** The keyword that names each difficulty; step n is index n - 1. Harder steps are ones a beginner can't write yet. */
export const DIFFICULTY_WORDS = ["pass", "try", "raise", "assert", "while True:"] as const;

/** The tier's name as shown (pawn becomes Pawn). */
export const tierName = (tier: string): string => tier.charAt(0).toUpperCase() + tier.slice(1);

/** Difficulty `step` (1-5): the keyword and five pips, filled up to the step, so it reads without colour. */
export function difficultyTag(step: number): HTMLElement {
  const word = DIFFICULTY_WORDS[step - 1];
  if (!Number.isInteger(step) || word === undefined) throw new Error(`difficulty step must be 1 to 5, got ${step}`);
  const pips = DIFFICULTY_WORDS.map((_, i) => h("span", { class: i < step ? "diff-pip on" : "diff-pip" }));
  return h(
    "span",
    { class: "diff-tag", "data-step": String(step), role: "img", "aria-label": `Difficulty ${step} of 5: ${word}`, title: `Difficulty ${step} of 5` },
    h("code", {}, word),
    h("span", { class: "diff-pips", "aria-hidden": "true" }, ...pips),
  );
}

/** The mark a list row carries in place of its tier when the engine refused the level: words, not colour alone. */
export function problemTag(): HTMLElement {
  return h("span", { class: "tier-tag problem-tag", title: "The engine can't open this level as it is. Open it in the editor to see why." }, "has problems");
}

/** The tier whose lessons the level needs. */
export function tierTag(tier: string): HTMLElement {
  const name = tierName(tier);
  return h("span", { class: "tier-tag", title: `Needs what the ${name} tier teaches` }, `♟ ${name}`);
}
