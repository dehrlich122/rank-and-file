// The home screen: chapters and their levels.
import type { Chapter } from "../content";
import { h } from "./dom";

export function renderLevelSelect(chapters: Chapter[], solved: ReadonlySet<string>): HTMLElement {
  return h(
    "div",
    { class: "home" },
    h(
      "section",
      { class: "intro" },
      h("h1", {}, "Learn Python by moving a chess piece"),
      h(
        "p",
        {},
        "Every level teaches one idea with a short lesson you can run, then gives you a puzzle that needs it. " +
          "You write real Python; your pawn does exactly what your code says.",
      ),
    ),
    ...chapters.map((chapter) =>
      h(
        "section",
        { class: "chapter" },
        h(
          "header",
          {},
          h("span", { class: "tier" }, chapter.tier),
          h("h2", {}, `Chapter ${chapter.chapter} · ${chapter.title}`),
          h("p", { class: "muted" }, chapter.summary),
        ),
        h(
          "ol",
          { class: "level-list" },
          ...chapter.levels.map((level, i) =>
            h(
              "li",
              {},
              h(
                "a",
                { href: `#/level/${level.id}`, class: solved.has(level.id) ? "level-card solved" : "level-card" },
                h("span", { class: "level-number" }, solved.has(level.id) ? "✓" : String(i + 1)),
                h("span", { class: "level-text" }, h("strong", {}, level.title), h("span", { class: "muted small" }, level.trains)),
              ),
            ),
          ),
        ),
      ),
    ),
    h("footer", { class: "muted small" }, "Progress is kept until you close the tab (saving comes in a later milestone). ", h("a", { href: "#/harness" }, "Python harness")),
  );
}
