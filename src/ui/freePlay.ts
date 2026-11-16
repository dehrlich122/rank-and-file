// Free Play (M4.4, docs/M4/M4.4.md): the hub at #/free, a directory like Lessons, and its pages at #/free/<section>.
// This file draws the hub, the Challenges page and (through sharedList.ts) Shared with me. The Sandbox and Skins have
// screens of their own (app.ts routes them), and My levels stays at #/editor.
import { challengeSets, chapterName, drawnChapters, type ChallengeSet, type LevelSource } from "../content";
import { drafts } from "../editor/drafts";
import { progress } from "../progress";
import type { PyClient } from "../py/client";
import { sharedLevels } from "../share/shared";
import { h } from "./dom";
import { applyList, listControls, starsText, type ListState } from "./listControls";
import { sandboxAbilities } from "./sandboxScreen";
import { mountSharedList } from "./sharedList";
import { skinCards } from "./skinsScreen";
import { difficultyTag, tierTag } from "./tags";

/** Free Play's sections, in the hub's order: the address of each, its glyph, name and one line on what it holds. */
const FREE_SECTIONS = [
  { id: "challenges", href: "#/free/challenges", glyph: "♟", name: "Challenges", line: "Each tier's mastery set: puzzles that mix its chapters" },
  { id: "levels", href: "#/editor", glyph: "✎", name: "My levels", line: "Levels you made in the editor" },
  { id: "shared", href: "#/free/shared", glyph: "⇄", name: "Shared with me", line: "Levels others sent you, by link or code" },
  { id: "sandbox", href: "#/free/sandbox", glyph: "▢", name: "Sandbox", line: "An open board with every ability you've met" },
  { id: "skins", href: "#/free/skins", glyph: "◆", name: "Skins", line: "The looks your promotions unlocked" },
] as const;

/** A section with a page of its own at `#/free/<id>` (My levels stays at `#/editor`). */
export type FreePage = Exclude<(typeof FREE_SECTIONS)[number]["id"], "levels">;
type FreeSection = (typeof FREE_SECTIONS)[number]["id"];

/** The section an address under `#/free/` names (its first part), or null when there is no such page. */
export function freePage(path: string): FreePage | null {
  const first = path.split("/")[0];
  const section = FREE_SECTIONS.find((s) => s.id === first);
  return section && section.id !== "levels" ? section.id : null;
}

/** A section's name, as its row, crumbs and title say it. */
export const freeSectionName = (id: FreeSection): string => FREE_SECTIONS.find((s) => s.id === id)!.name;

const countOf = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** What the hub knows about each section, so its counts can be worked out from any stores. */
export interface HubFacts {
  sets: ChallengeSet[];
  solved: (id: string) => boolean;
  myLevels: number;
  shared: number;
  abilities: number;
  skins: Array<{ unlocked: boolean }>;
}

/** The count shown on each hub row. */
export function hubCounts(facts: HubFacts): Record<FreeSection, string> {
  const ids = facts.sets.flatMap((set) => set.levels.map((level) => level.id));
  return {
    challenges: ids.length ? `${ids.filter(facts.solved).length} of ${ids.length} solved` : "Coming soon",
    levels: countOf(facts.myLevels, "level", "levels"),
    shared: countOf(facts.shared, "level", "levels"),
    sandbox: countOf(facts.abilities, "ability", "abilities"),
    skins: `${facts.skins.filter((skin) => skin.unlocked).length} of ${facts.skins.length} unlocked`,
  };
}

/** One challenge set as the Challenges page lists it. */
export interface ChallengeGroup {
  set: ChallengeSet;
  solved: number;
  /** The set's levels that pass the difficulty filter, sorted; `set.levels.length` is the whole set. */
  levels: LevelSource[];
}

/** The sets that pass the tier filter, each with its levels filtered by difficulty and sorted (all within the set). */
export function challengeGroups(sets: ChallengeSet[], state: ListState, solved: (id: string) => boolean): ChallengeGroup[] {
  return sets
    .filter((set) => state.tier === null || set.tier === state.tier)
    .map((set) => ({
      set,
      solved: set.levels.filter((level) => solved(level.id)).length,
      levels: applyList(set.levels, { ...state, tier: null }, (level) => ({ tier: set.tier, difficulty: level.difficulty ?? null })),
    }));
}

/** The "Draws on" line of a challenge: the names of the chapters it mixes, "" when it names none. */
export function drawsOnText(level: LevelSource): string {
  const names = drawnChapters(level.data.draws_on).map(chapterName);
  return names.length ? `Draws on ${names.join("; ")}` : "";
}

function hub(main: HTMLElement): void {
  const counts = hubCounts({
    sets: challengeSets,
    solved: (id) => progress.solved(id),
    myLevels: drafts.list().length,
    shared: sharedLevels.list().length,
    abilities: sandboxAbilities().length,
    skins: skinCards(),
  });
  const row = (s: (typeof FREE_SECTIONS)[number]) =>
    h(
      "li",
      {},
      h(
        "a",
        { class: "fp-row", href: s.href, "data-section": s.id },
        h("span", { class: "fp-glyph", "aria-hidden": "true" }, s.glyph),
        h("span", { class: "fp-text" }, h("strong", {}, s.name), h("span", { class: "muted small" }, s.line)),
        h("span", { class: "fp-count" }, counts[s.id]),
      ),
    );
  main.replaceChildren(
    h(
      "div",
      { class: "free-play" },
      h("h1", { class: "lessons-title" }, "Free Play"),
      h("p", { class: "muted" }, "No lessons here: puzzles that mix what you've learned, levels you made or were sent, and a board to try things on."),
      h("div", { class: "hud-frame" }, h("ul", { class: "fp-rows" }, ...FREE_SECTIONS.map(row))),
    ),
  );
}

function challengesPage(main: HTMLElement): void {
  const tiers = [...new Set(challengeSets.map((set) => set.tier))];
  const groups = h("div", { class: "ch-sets" });
  const controls = listControls("challenges", tiers, () => draw());

  const row = (level: LevelSource, n: number): HTMLElement => {
    const best = progress.level(level.id).stars;
    return h(
      "li",
      {},
      h(
        "a",
        { class: "ch-row", href: `#/challenge/${level.id}` },
        h("span", { class: "lrow-num" }, best ? "✓" : String(n)),
        h("span", { class: "lrow-text" }, h("strong", {}, level.title), h("span", { class: "muted small" }, drawsOnText(level))),
        level.difficulty ? h("span", { class: "tags" }, difficultyTag(level.difficulty)) : null,
        best ? h("span", { class: "card-stars", title: `${best} of 3 stars` }, starsText(best), h("span", { class: "sr-only" }, `${best} of 3 stars`)) : h("span", { class: "card-stars muted", "aria-hidden": "true" }, "☆☆☆"),
      ),
    );
  };

  function draw(): void {
    const shown = challengeGroups(challengeSets, controls.state(), (id) => progress.solved(id));
    controls.show(challengeSets.some((set) => set.levels.length > 0)); // nothing to filter while no set has a level
    groups.replaceChildren(
      ...(shown.length
        ? shown.flatMap(({ set, solved, levels }) => [
            h("div", { class: "set-head" }, h("h2", {}, set.title), tierTag(set.tier), h("span", { class: "muted small" }, set.summary), set.levels.length ? h("span", { class: "muted small" }, `${solved} of ${set.levels.length} solved`) : null),
            set.levels.length
              ? levels.length
                ? h("ul", { class: "ch-rows" }, ...levels.map((level) => row(level, set.levels.indexOf(level) + 1)))
                : h("p", { class: "muted" }, "No challenges match these filters.")
              : h("p", { class: "muted" }, "Its challenges are coming soon."),
          ])
        : [h("p", { class: "muted" }, challengeSets.length ? "No sets match these filters." : "No challenges yet.")]),
    );
  }

  main.replaceChildren(h("div", { class: "free-play" }, h("h1", { class: "lessons-title" }, "Challenges"), controls.element, groups));
  draw();
}

/**
 * Mount the hub (`section` null) or one of its pages in `main`. Returns what to call to leave it. The Sandbox and Skins
 * pages have their own screens (app.ts); `client` asks the engine for the tiers of levels outside the curriculum.
 */
export function mountFreePlay(main: HTMLElement, section: "challenges" | "shared" | null, client: PyClient): () => void {
  if (section === "shared") return mountSharedList(main, client);
  if (section === "challenges") challengesPage(main);
  else hub(main);
  return () => {};
}
