// My levels (M4.2): `#/editor`. The levels made in the editor, saved in this browser, newest edit first. From here a
// new level starts blank, from a lesson level's board, or from a .yaml file; and each can be duplicated, exported
// or deleted.
import { chapterName, chapters, findLevel } from "../content";
import { blankDraft, newId, type Draft } from "../editor/draft";
import { drafts } from "../editor/drafts";
import { ImportError, yamlToDraft } from "../editor/levelData";
import { editorOptions } from "../editor/options";
import { readSolution, setSolution } from "../editor/rules";
import { copyOfLevel } from "../editor/starts";
import type { PyClient } from "../py/client";
import { codeFromText, MAX_LEVEL_BYTES } from "../share/codec";
import { openRemix, sharedLevels, sharedProgress } from "../share/shared";
import { confirmStep } from "./dialog";
import { downloadLevel } from "./download";
import { h } from "./dom";

const when = (ms: number): string => new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** A shared level's stars as the list shows them: "★★☆", or "not solved yet". */
export const starsText = (stars: number): string => (stars > 0 ? "★".repeat(stars) + "☆".repeat(Math.max(0, 3 - stars)) : "not solved yet");
export const boardsText = (boards: number): string => `${boards} ${boards === 1 ? "board" : "boards"}`;

export function mountEditorList(root: HTMLElement, client: PyClient): () => void {
  const confirmHost = h("div", { class: "ed-confirm" });
  const notice = h("p", { class: "muted", role: "status" });
  const list = h("ul", { class: "my-levels" });
  const shared = h("ul", { class: "my-levels" });

  /** Save a level and open it in the editor; with something to tell first, stay here and say it (QA-044). */
  function open(draft: Draft, message?: string): void {
    drafts.save(draft);
    if (!message) return void (location.hash = `#/editor/${draft.id}`);
    notice.textContent = message;
    draw();
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

  function drawShared(): void {
    const kept = sharedLevels.list();
    shared.replaceChildren(
      ...(kept.length
        ? kept.map((level) =>
            h(
              "li",
              { class: "my-level panel" },
              h(
                "a",
                { class: "my-level-open", href: `#/shared/${level.id}` },
                h("strong", {}, level.title),
                h("span", { class: "muted small" }, ` · ${starsText(sharedProgress.level(level.id).stars)} · ${boardsText(level.boards)}`),
              ),
              h("button", { class: "btn btn-small", "aria-label": `Remix ${level.title}`, onClick: () => remix(level.id) }, "Remix"),
              h("button", { class: "btn btn-small", "aria-label": `Remove ${level.title}`, onClick: () => askRemove(level.id, level.title) }, "Remove"),
            ),
          )
        : [h("li", { class: "muted" }, "Levels opened from a link or code are kept here.")]),
    );
  }

  function remix(id: string): void {
    const data = sharedLevels.get(id);
    if (data) openRemix(data);
  }

  function askRemove(id: string, name: string): void {
    confirmHost.replaceChildren(
      confirmStep(`Remove "${name}" from Shared with me? Your stars on it stay.`, "Yes, remove it", "Keep it", (yes) => {
        confirmHost.replaceChildren();
        if (yes) {
          sharedLevels.remove(id);
          notice.textContent = `Removed "${name}" from Shared with me.`;
          drawShared();
        }
      }),
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

  const linkInput = h("input", { type: "text", id: "link-or-code", autocomplete: "off", spellcheck: "false" });
  const linkForm = h(
    "form",
    { class: "toolbar", hidden: "" },
    h("label", { for: "link-or-code" }, "A link or code"),
    linkInput,
    h("button", { class: "btn btn-primary", type: "submit" }, "Open"),
    h("button", { class: "btn", type: "button", onClick: () => closeLink() }, "Cancel"),
  );
  linkForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const code = codeFromText(linkInput.value);
    if (code) location.hash = `#/play/${code}`;
    else notice.textContent = "That isn't a link or code for a Rank & File level.";
  });
  function closeLink(): void {
    linkForm.hidden = true;
    linkInput.value = "";
  }

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
        h("button", { class: "btn", onClick: () => ((linkForm.hidden = false), linkInput.focus()) }, "Open a link or code"),
        file,
      ),
      linkForm,
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
      h("h2", { class: "my-levels-title" }, "Shared with me"),
      shared,
    ),
  );
  draw();
  drawShared();
  return () => {};
}
