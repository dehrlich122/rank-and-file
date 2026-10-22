// Free Play (M4.4, docs/M4/M4.4.md): the hub at #/free, a directory like Lessons, and its sections at #/free/<section>.
// Contract placeholder: the hub's rows link to every section; the Challenges and Shared pages are built by WP 4d.
import type { PyClient } from "../py/client";
import { h } from "./dom";

/** Free Play's sections, in the hub's order: the address of each, its glyph, name and one line on what it holds. */
const FREE_SECTIONS = [
  { id: "challenges", href: "#/free/challenges", glyph: "♟", name: "Challenges", line: "Each tier's mastery set: puzzles that mix its chapters" },
  { id: "levels", href: "#/editor", glyph: "✎", name: "My levels", line: "Levels you made in the editor" },
  { id: "shared", href: "#/free/shared", glyph: "⇄", name: "Shared with me", line: "Levels others sent you, by link or code" },
  { id: "sandbox", href: "#/free/sandbox", glyph: "▢", name: "Sandbox", line: "An open board with every ability you've met" },
  { id: "skins", href: "#/free/skins", glyph: "◆", name: "Skins", line: "The looks your promotions unlocked" },
] as const;

export type FreeSection = (typeof FREE_SECTIONS)[number]["id"];

/**
 * Mount the hub (`section` null) or one of its pages in `main`. Returns what to call to leave it. The Sandbox and Skins
 * pages have their own screens (app.ts); `client` asks the engine for the tiers of levels outside the curriculum.
 */
export function mountFreePlay(main: HTMLElement, section: FreeSection | null, _client: PyClient): () => void {
  const page = FREE_SECTIONS.find((s) => s.id === section);
  if (page) {
    main.replaceChildren(h("div", { class: "free-play" }, h("h1", { class: "free-title" }, page.name), h("p", { class: "muted" }, page.line)));
    return () => {};
  }
  const row = (s: (typeof FREE_SECTIONS)[number]) =>
    h(
      "li",
      {},
      h("a", { class: "fp-row", href: s.href, "data-section": s.id }, h("span", { class: "fp-glyph", "aria-hidden": "true" }, s.glyph), h("span", { class: "fp-text" }, h("strong", {}, s.name), h("span", { class: "muted small" }, s.line))),
    );
  main.replaceChildren(
    h(
      "div",
      { class: "free-play" },
      h("h1", { class: "free-title" }, "Free Play"),
      h("p", { class: "muted" }, "No lessons here: puzzles that mix what you've learned, levels you made or were sent, and a board to try things on."),
      h("div", { class: "hud-frame" }, h("ul", { class: "fp-rows" }, ...FREE_SECTIONS.map(row))),
    ),
  );
  return () => {};
}
