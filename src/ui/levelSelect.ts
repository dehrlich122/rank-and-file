// The home screen: chapters and their levels.
import { chapterName, type Chapter } from "../content";
import type { ProgressStore } from "../progress";
import { h } from "./dom";
import { icon } from "./icons";

/** The tag on a chapter's optional mastery challenge (M3.2): on its card, and in its Challenge panel. */
export const masteryTag = () => h("span", { class: "mastery-tag" }, "Mastery · optional");

export function renderLevelSelect(chapters: Chapter[], progress: ProgressStore): HTMLElement {
  /** A level's card: its number (✓ once solved), what it trains, and its best stars or "Solution seen". */
  const card = (level: Chapter["levels"][number], number: number) => {
    const { stars, helped } = progress.level(level.id);
    const solved = stars > 0;
    return h(
      "a",
      { href: `#/level/${level.id}`, class: solved ? "level-card solved" : "level-card" },
      h("span", { class: "level-number" }, solved ? "✓" : String(number)),
      h(
        "span",
        { class: "level-text" },
        h("strong", {}, level.title, level.mastery ? masteryTag() : null),
        h("span", { class: "muted small" }, level.trains),
      ),
      solved
        ? h(
            "span",
            { class: "card-stars", title: `${stars} of 3 stars`, "aria-label": `${stars} of 3 stars` },
            ...[0, 1, 2].map((i) => icon(i < stars ? "star" : "starOutline")),
          )
        : helped
          ? h("span", { class: "card-tag muted small" }, "Solution seen")
          : null,
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
          h("h2", {}, chapterName(chapter)),
          h("p", { class: "muted" }, chapter.summary),
        ),
        h(
          "ol",
          { class: "level-list" },
          ...chapter.levels.map((level, i) => h("li", {}, card(level, i + 1))),
        ),
      ),
    ),
    h("footer", { class: "muted small" }, "Your progress and code are saved in this browser. Settings → Reset progress starts over. ", h("a", { href: "#/harness" }, "Python harness")),
  );
}
