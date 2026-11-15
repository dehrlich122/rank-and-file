// My levels (M4.2): `#/editor`. The levels made in the editor, saved in this browser, newest edit first. From here a
// new level starts blank, from a lesson level's board, or from a .yaml file; and each can be duplicated, exported
// or deleted. Each row carries its tier and difficulty tags (M4.4), and the list filters and sorts by both.
import { chapterName, chapters, curriculumTiers, findLevel } from "../content";
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
import { applyList, listControls, noMatchRow } from "./listControls";
import { tierTags } from "./tierTags";

const when = (ms: number): string => new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

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
  const controls = listControls("my-levels", curriculumTiers(), () => draw());

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
