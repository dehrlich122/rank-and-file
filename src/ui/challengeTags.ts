// What the Challenge panel says about a level outside the lessons (M4.4): its tags, and for a challenge the chapters it draws on.
import { chapterName, chapters } from "../content";
import type { LevelInfo } from "../py/protocol";
import { h } from "./dom";
import type { LevelHost } from "./levelHost";
import { difficultyTag, tierTag } from "./tags";

/**
 * The tag row (tier, difficulty) and, for a challenge, the "Draws on" line: one link per chapter that exists. `tier` is the
 * level's tier when it is known (a lesson level carries none: it is in its tier by definition). Empty when there is nothing to say.
 */
export function levelTagsRow(info: Pick<LevelInfo, "difficulty" | "draws_on">, kind: LevelHost["kind"], tier: string | null): HTMLElement[] {
  const tags = [
    ...(tier && kind !== "lesson" ? [tierTag(tier)] : []),
    ...(info.difficulty !== null && info.difficulty !== undefined ? [difficultyTag(info.difficulty)] : []),
  ];
  const drawn = kind === "challenge" ? info.draws_on.flatMap((number) => chapters.find((c) => c.curriculum && c.chapter === number) ?? []) : [];
  return [
    ...(tags.length ? [h("div", { class: "tags" }, ...tags)] : []),
    ...(drawn.length
      ? [
          h(
            "div",
            { class: "draws-on" },
            h("span", { class: "draws-on-label" }, "Draws on"),
            ...drawn.map((chapter) => h("a", { class: "chapter-chip", href: `#/lessons/${chapter.chapter}` }, chapterName(chapter))),
          ),
        ]
      : []),
  ];
}
