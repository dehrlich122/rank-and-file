// My levels (M4.2): `#/editor`. The levels made in the editor, saved in this browser, newest edit first. From here a
// new level starts blank, from a lesson level's board, or from a .yaml file; and each can be duplicated, exported
// or deleted. Each row carries its tier and difficulty tags (M4.4), and the list filters and sorts by both. The
// helpers at the top are shared with the Shared with me page (sharedList.ts).
import { chapterName, chapters, codexChapters, findLevel } from "../content";
import { blankDraft, newId, type Draft } from "../editor/draft";
import { drafts } from "../editor/drafts";
import { draftToLevelData, ImportError, yamlToDraft } from "../editor/levelData";
import { editorOptions } from "../editor/options";
import { readSolution, setSolution } from "../editor/rules";
import { copyOfLevel } from "../editor/starts";
import type { PyClient } from "../py/client";
import { MAX_LEVEL_BYTES } from "../share/codec";
import { sharedLevels } from "../share/shared";
import { confirmStep } from "./dialog";
import { downloadLevel } from "./download";
import { h } from "./dom";
import { applyList, listControls, listState, saveListState, type ListState } from "./listControls";
import { difficultyTag, tierTag } from "./tags";

const when = (ms: number): string => new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** A shared level's stars as the list shows them: "★★☆", or "not solved yet". */
export const starsText = (stars: number): string => (stars > 0 ? "★".repeat(stars) + "☆".repeat(Math.max(0, 3 - stars)) : "not solved yet");
export const boardsText = (boards: number): string => `${boards} ${boards === 1 ? "board" : "boards"}`;

/** The curriculum's tiers in play order: what the Tier filter of My levels and Shared with me offers. */
export const curriculumTiers = (): string[] => [...new Set(chapters.filter((c) => c.curriculum).map((c) => c.tier))];

/**
 * The filter and sort row of the list `listId`, remembered for the session. The row keeps the state it was built
 * with, so it is rebuilt on each change (keeping the focus on the same control); `onChange` then redraws the list.
 */
export function listControlsHost(listId: string, tiers: string[], onChange: () => void): { element: HTMLElement; state: () => ListState } {
  let state = listState(listId);
  const element = h("div", {});
  const paint = (): void => {
    const at = [...element.querySelectorAll("select")].indexOf(document.activeElement as HTMLSelectElement);
    element.replaceChildren(
      listControls(tiers, state, (next) => {
        state = next;
        saveListState(listId, next);
        paint();
        onChange();
      }),
    );
    if (at >= 0) element.querySelectorAll("select")[at]?.focus();
  };
  paint();
  return { element, state: () => state };
}

const tagsOf = (tier: string | null, difficulty: number | null): HTMLElement[] => [...(tier ? [tierTag(tier)] : []), ...(difficulty ? [difficultyTag(difficulty)] : [])];

/**
 * The engine's tier for a level outside the curriculum (request `levelTags`), asked once per level and never waited
 * for: a row is drawn at once with its difficulty tag and gets its tier tag when the answer comes. A level the engine
 * refuses has no tier tag. With a Tier filter on (`filtering`) an answer redraws the list instead (`redraw`).
 */
export function tierTags(client: PyClient, filtering: () => boolean, redraw: () => void) {
  const tiers = new Map<string, string | null>();
  const asked = new Set<string>();
  const slots = new Map<string, { element: HTMLElement; difficulty: number | null }>();
  let stopped = false;
  return {
    /** Ask for this level's tier, once. `data` builds the level's data when it is needed. */
    ask(id: string, data: () => unknown): void {
      if (asked.has(id)) return;
      asked.add(id);
      void client.ready()
        .then(() => client.call("levelTags", { level: data(), chapters: codexChapters() }))
        .then(
          (result) => result.tier,
          () => null,
        )
        .then((tier) => {
          if (stopped) return;
          tiers.set(id, tier);
          const slot = slots.get(id);
          if (filtering()) redraw();
          else slot?.element.replaceChildren(...tagsOf(tier, slot.difficulty));
        });
    },
    tier: (id: string): string | null => tiers.get(id) ?? null,
    /** The tags cell of a row. */
    slot(id: string, difficulty: number | null): HTMLElement {
      const element = h("span", { class: "tags" }, ...tagsOf(tiers.get(id) ?? null, difficulty));
      slots.set(id, { element, difficulty });
      return element;
    },
    stop: (): void => void (stopped = true),
  };
}

export function mountEditorList(root: HTMLElement, client: PyClient): () => void {
  const confirmHost = h("div", { class: "ed-confirm" });
  const notice = h("p", { class: "muted", role: "status" });
  const list = h("ul", { class: "my-levels" });
  const sharedLink = h("a", { href: "#/free/shared" });
  const tags = tierTags(
    client,
    () => controls.state().tier !== null,
    () => draw(),
  );
  const controls = listControlsHost("my-levels", curriculumTiers(), () => draw());

  /** Save a level and open it in the editor; with something to tell first, stay here and say it (QA-044). */
  function open(draft: Draft, message?: string): void {
    drafts.save(draft);
    if (!message) return void (location.hash = `#/editor/${draft.id}`);
    notice.textContent = message;
    draw();
  }

  function draw(): void {
    const all = drafts.list();
    for (const level of all) {
      tags.ask(level.id, () => {
        const draft = drafts.load(level.id);
        return draft ? draftToLevelData(draft) : null;
      });
    }
    const levels = applyList(all, controls.state(), (level) => ({ tier: tags.tier(level.id), difficulty: level.difficulty }));
    sharedLink.textContent = `Shared with me (${sharedLevels.list().length}) →`;
    list.replaceChildren(
      ...(levels.length
        ? levels.map((level) =>
            h(
              "li",
              { class: "my-level panel" },
              h("a", { class: "my-level-open", href: `#/editor/${level.id}` }, h("strong", {}, level.title), h("span", { class: "muted small" }, ` · ${level.width} × ${level.height} · edited ${when(level.edited)}`)),
              tags.slot(level.id, level.difficulty),
              h("button", { class: "btn btn-small", "aria-label": `Duplicate ${level.title}`, onClick: () => duplicate(level.id) }, "Duplicate"),
              h("button", { class: "btn btn-small", "aria-label": `Export ${level.title}`, onClick: () => exportLevel(level.id) }, "Export"),
              h("button", { class: "btn btn-small", "aria-label": `Delete ${level.title}`, onClick: () => ask(level.id, level.title) }, "Delete"),
            ),
          )
        : [h("li", { class: "muted" }, all.length ? "No levels match these filters." : "You haven't made a level yet.")]),
    );
  }

  function duplicate(id: string): void {
    const draft = drafts.load(id);
    if (!draft) return;
    drafts.save({ ...draft, id: newId(), title: `Copy of ${draft.title}` });
    notice.textContent = `Duplicated "${draft.title}".`;
    draw();
  }

  function exportLevel(id: string): void {
    const draft = drafts.load(id);
    if (draft) downloadLevel(draft);
  }

  function ask(id: string, name: string): void {
    confirmHost.replaceChildren(
      confirmStep(`Delete "${name}"? This can't be undone.`, "Yes, delete it", "Keep it", (yes) => {
        confirmHost.replaceChildren();
        if (yes) {
          drafts.remove(id);
          notice.textContent = `Deleted "${name}".`;
          draw();
        }
      }),
    );
  }

  // -- ways to start ------------------------------------------------------------------------------------------

  const file = h("input", { type: "file", accept: ".yaml,.yml,text/yaml,text/plain", class: "sr-only", tabindex: "-1", "aria-hidden": "true" });
  file.addEventListener("change", () => void importFile());

  async function importFile(): Promise<void> {
    const chosen = file.files?.[0];
    file.value = "";
    if (!chosen) return;
    if (chosen.size > MAX_LEVEL_BYTES) return void (notice.textContent = `${chosen.name} is too big to be a level (over ${MAX_LEVEL_BYTES / 1024} KB).`);
    try {
      const options = await editorOptions(client);
      const imported = yamlToDraft(await chosen.text(), { maxSide: options.max_side, id: newId() });
      const left = readSolution(imported) !== "";
      open(setSolution(imported, null), left ? `Added ${chosen.name} to your levels. Its solution was left out: solve it in test-play to keep your own.` : undefined);
    } catch (error) {
      notice.textContent = error instanceof ImportError ? `Couldn't open ${chosen.name}: ${error.message}` : `Couldn't read ${chosen.name}.`;
    }
  }

  const lessonLevels = chapters.flatMap((chapter) =>
    chapter.levels.length
      ? [h("optgroup", { label: chapterName(chapter) }, ...chapter.levels.map((level, i) => h("option", { value: level.id }, `${chapter.curriculum ? `${chapter.chapter}.${i + 1} ` : ""}${level.title}`)))]
      : [],
  );
  const picker = h("select", { "aria-label": "A lesson level to copy" }, ...lessonLevels);
  const copy = () => {
    const level = findLevel(picker.value);
    if (level) open(copyOfLevel(level.data));
  };

  root.replaceChildren(
    h(
      "div",
      { class: "editor-list" },
      h("h1", {}, "My levels"),
      h("p", { class: "muted" }, "Levels you make are kept in this browser. Nothing leaves the browser unless you export or share one."),
      h(
        "div",
        { class: "toolbar" },
        h("button", { class: "btn btn-primary", onClick: () => open(blankDraft()) }, "New level"),
        h("button", { class: "btn", onClick: () => file.click() }, "Import a .yaml file"),
        file,
      ),
      h(
        "div",
        { class: "toolbar ed-copy" },
        h("span", { class: "muted" }, "Or start from a lesson level's board and rules (never its hints or solution):"),
        picker,
        h("button", { class: "btn btn-small", onClick: copy }, "Copy it"),
      ),
      h("p", { class: "muted" }, "Levels sent to you, by link or code, are in ", sharedLink),
      controls.element,
      notice,
      confirmHost,
      list,
    ),
  );
  draw();
  return () => tags.stop();
}
