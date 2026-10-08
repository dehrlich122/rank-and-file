// My levels (M4.2): `#/editor`. The levels made in the editor, saved in this browser, newest edit first. From here a
// new level starts blank, from a lesson level's board, or from a .yaml file; and each can be duplicated, exported
// or deleted.
import { chapterName, chapters, findLevel } from "../content";
import { blankDraft, newId, type Draft } from "../editor/draft";
import { drafts } from "../editor/drafts";
import { draftToYaml, ImportError, yamlToDraft } from "../editor/levelData";
import { editorOptions } from "../editor/options";
import { copyOfLevel } from "../editor/starts";
import type { PyClient } from "../py/client";
import { confirmStep } from "./dialog";
import { download, fileName } from "./download";
import { h } from "./dom";

const MAX_FILE_BYTES = 64 * 1024; // a level file is a few KB; more than this isn't one
const when = (ms: number): string => new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function mountEditorList(root: HTMLElement, client: PyClient): () => void {
  const confirmHost = h("div", { class: "ed-confirm" });
  const notice = h("p", { class: "muted", role: "status" });
  const list = h("ul", { class: "my-levels" });

  function open(draft: Draft): void {
    drafts.save(draft);
    location.hash = `#/editor/${draft.id}`;
  }

  function draw(): void {
    const levels = drafts.list();
    list.replaceChildren(
      ...(levels.length
        ? levels.map((level) =>
            h(
              "li",
              { class: "my-level panel" },
              h("a", { class: "my-level-open", href: `#/editor/${level.id}` }, h("strong", {}, level.title), h("span", { class: "muted small" }, ` · ${level.width} × ${level.height} · edited ${when(level.edited)}`)),
              h("button", { class: "btn btn-small", "aria-label": `Duplicate ${level.title}`, onClick: () => duplicate(level.id) }, "Duplicate"),
              h("button", { class: "btn btn-small", "aria-label": `Export ${level.title}`, onClick: () => exportLevel(level.id) }, "Export"),
              h("button", { class: "btn btn-small", "aria-label": `Delete ${level.title}`, onClick: () => ask(level.id, level.title) }, "Delete"),
            ),
          )
        : [h("li", { class: "muted" }, "You haven't made a level yet.")]),
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
    if (draft) download(`${fileName(draft.title)}.yaml`, draftToYaml(draft));
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
    if (chosen.size > MAX_FILE_BYTES) return void (notice.textContent = `${chosen.name} is too big to be a level (over ${MAX_FILE_BYTES / 1024} KB).`);
    try {
      const options = await editorOptions(client);
      open(yamlToDraft(await chosen.text(), { maxSide: options.max_side, id: newId() }));
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
      h("p", { class: "muted" }, "Levels you make are kept in this browser. Nothing leaves it unless you export one."),
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
      notice,
      confirmHost,
      list,
    ),
  );
  draw();
  return () => {};
}
