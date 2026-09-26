// The home screen: chapters and their levels.
import type { Chapter } from "../content";
import type { ProgressStore } from "../progress";
import { h } from "./dom";
import { icon } from "./icons";

export function renderLevelSelect(chapters: Chapter[], progress: ProgressStore): HTMLElement {
  const solved = (id: string) => progress.level(id).solved;
  const stars = (id: string) => {
    const earned = progress.level(id).stars;
    return h(
      "span",
      { class: "card-stars", title: `${earned} of 3 stars`, "aria-label": `${earned} of 3 stars` },
      ...[0, 1, 2].map((i) => icon(i < earned ? "star" : "starOutline")),
    );
  };
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
                { href: `#/level/${level.id}`, class: solved(level.id) ? "level-card solved" : "level-card" },
                h("span", { class: "level-number" }, solved(level.id) ? "✓" : String(i + 1)),
                h("span", { class: "level-text" }, h("strong", {}, level.title), h("span", { class: "muted small" }, level.trains)),
                solved(level.id) ? stars(level.id) : null,
              ),
            ),
          ),
        ),
      ),
    ),
    h("footer", { class: "muted small" }, "Your progress and code are saved in this browser. Settings → Reset progress starts over. ", h("a", { href: "#/harness" }, "Python harness")),
  );
}
