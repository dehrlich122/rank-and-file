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
import { PythonHungError, StoppedError, type PyClient } from "../py/client";
import { MAX_LEVEL_BYTES } from "../share/codec";
import { sharedLevels } from "../share/shared";
import { confirmStep } from "./dialog";
import { downloadLevel } from "./download";
import { h } from "./dom";
import { applyList, listControls, listState, saveListState, type ListState } from "./listControls";
import { difficultyTag, problemTag, tierTag } from "./tags";

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
export function listControlsHost(listId: string, tiers: string[], onChange: () => void): { element: HTMLElement; state: () => ListState; show: (on: boolean) => void; clear: () => void } {
  let state = listState(listId);
  const element = h("div", { class: "list-controls-host" });
  const set = (next: ListState): void => {
    state = next;
    saveListState(listId, next);
    paint();
    onChange();
  };
  const paint = (): void => {
    const at = [...element.querySelectorAll("select")].indexOf(document.activeElement as HTMLSelectElement);
    element.replaceChildren(listControls(tiers, state, set));
    if (at >= 0) element.querySelectorAll("select")[at]?.focus();
  };
  paint();
  return {
    element,
    state: () => state,
    /** The row is there only while its list has something in it (QA-049). */
    show: (on) => void (element.hidden = !on),
    /** Tier and Difficulty back to any; the sort stays. */
    clear: () => set({ ...state, tier: null, difficulty: null }),
  };
}

/** What a list says when its filters leave nothing, with the way out. */
export const noMatchRow = (clear: () => void): HTMLElement =>
  h("li", { class: "muted" }, "No levels match these filters. ", h("button", { class: "btn btn-small", onClick: clear }, "Clear filters"));

/** What the engine said about a level's tier: `refused` when it would not open the level at all. */
interface TierAnswer {
  tier: string | null;
  refused: boolean;
}

/**
 * Whether a failed request is the engine refusing the level: the worker reports a Python `LevelError` as an error
 * whose message is its traceback. A stopped or hung worker, or one that crashed, is only "couldn't ask".
 */
const refusedByEngine = (error: unknown): boolean => error instanceof Error && !(error instanceof StoppedError) && !(error instanceof PythonHungError) && /\bLevelError: /.test(error.message);

const tierTagsOf =({ tier, refused }: TierAnswer): HTMLElement[] => (refused ? [problemTag()] : tier ? [tierTag(tier)] : []);

/**
 * The engine's tier for a level outside the curriculum (request `levelTags`), asked once per level and never waited
 * for: a row is drawn at once with its difficulty tag, the room for the tier tag kept, and gets the tier tag when the
 * answer comes. A level the engine refuses gets the "has problems" mark in its place (QA-046); an answer that is only
 * "couldn't ask" (the worker stopped or failed) leaves the place empty. With a Tier filter on (`filtering`) an answer
 * redraws the list instead (`redraw`).
 */
export function tierTags(client: PyClient, filtering: () => boolean, redraw: () => void) {
  const answers = new Map<string, TierAnswer>();
  const asked = new Set<string>();
  const slots = new Map<string, HTMLElement>();
  let stopped = false;
  const NO_ANSWER: TierAnswer = { tier: null, refused: false };
  async function answer(data: () => unknown): Promise<TierAnswer> {
    try {
      await client.ready();
    } catch {
      return NO_ANSWER;
    }
    try {
      const { tier } = await client.call("levelTags", { level: data(), chapters: codexChapters() });
      return { tier, refused: false };
    } catch (error) {
      return { tier: null, refused: refusedByEngine(error) };
    }
  }
  return {
    /** Ask for this level's tier, once. `data` builds the level's data when it is needed. */
    ask(id: string, data: () => unknown): void {
      if (asked.has(id)) return;
      asked.add(id);
      void answer(data).then((found) => {
        if (stopped) return;
        answers.set(id, found);
        if (filtering()) redraw();
        else slots.get(id)?.replaceChildren(...tierTagsOf(found));
      });
    },
    tier: (id: string): string | null => answers.get(id)?.tier ?? null,
    /** The tags cell of a row: a fixed place for the tier tag, then one for the difficulty tag, so no row's tags move. */
    slot(id: string, difficulty: number | null): HTMLElement {
      const tier = h("span", { class: "tags-tier" }, ...tierTagsOf(answers.get(id) ?? NO_ANSWER));
      slots.set(id, tier);
      return h("span", { class: "tags tags-fixed" }, tier, h("span", { class: "tags-diff" }, ...(difficulty ? [difficultyTag(difficulty)] : [])));
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
    controls.show(all.length > 0);
    list.replaceChildren(
      ...(levels.length
        ? levels.map((level) =>
            h(
              "li",
              { class: "my-level panel" },
              h("a", { class: "my-level-open", href: `#/editor/${level.id}` }, h("strong", {}, level.title), h("span", { class: "muted small" }, ` · ${level.width} × ${level.height} · `, h("span", { class: "nowrap" }, `edited ${when(level.edited)}`))),
              tags.slot(level.id, level.difficulty),
              h("button", { class: "btn btn-small", "aria-label": `Duplicate ${level.title}`, onClick: () => duplicate(level.id) }, "Duplicate"),
              h("button", { class: "btn btn-small", "aria-label": `Export ${level.title}`, onClick: () => exportLevel(level.id) }, "Export"),
              h("button", { class: "btn btn-small", "aria-label": `Delete ${level.title}`, onClick: () => ask(level.id, level.title) }, "Delete"),
            ),
          )
        : [all.length ? noMatchRow(controls.clear) : h("li", { class: "muted" }, "You haven't made a level yet.")]),
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
      h("h1", { class: "lessons-title" }, "My levels"),
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
        { class: "ed-copy" },
        h("span", { class: "muted" }, "Or start from a lesson level's board and rules (never its hints or solution):"),
        h("div", { class: "ed-copy-pick" }, picker, h("button", { class: "btn btn-small", onClick: copy }, "Copy it")),
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
