// What the Challenge panel says about a level outside the lessons (M4.4): its tags, and for a challenge the chapters it draws on.
import { chapterName, drawnChapters } from "../content";
import type { LevelInfo } from "../py/protocol";
import { h } from "./dom";
import { difficultyTag, tierTag } from "./tags";

/**
 * The tag row (tier, difficulty) and, with `drawsOn` (a challenge), the "Draws on" line: one link per chapter that exists.
 * `tier` is the level's tier when it is known (a lesson level is given none: it is in its tier by definition). Empty when
 * there is nothing to say.
 */
export function levelTagsRow(info: Pick<LevelInfo, "difficulty" | "draws_on">, tier: string | null, drawsOn: boolean): HTMLElement[] {
  const tags = [
    ...(tier ? [tierTag(tier)] : []),
    ...(info.difficulty !== null && info.difficulty !== undefined ? [difficultyTag(info.difficulty)] : []),
  ];
  const drawn = drawsOn ? drawnChapters(info.draws_on) : [];
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
