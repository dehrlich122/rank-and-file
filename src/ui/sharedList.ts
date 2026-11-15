// Shared with me (M4.3, moved into Free Play in M4.4): `#/free/shared`. Every shared level the player has opened,
// kept in this browser, with the form to open another from a link or code. Each row carries its tier and difficulty
// tags, and the list filters and sorts by both.
import type { PyClient } from "../py/client";
import { codeFromText } from "../share/codec";
import { openRemix, sharedLevels, sharedProgress } from "../share/shared";
import { confirmStep } from "./dialog";
import { h } from "./dom";
import { boardsText, curriculumTiers, listControlsHost, noMatchRow, starsText, tierTags } from "./editorList";
import { applyList } from "./listControls";

export function mountSharedList(root: HTMLElement, client: PyClient): () => void {
  const confirmHost = h("div", { class: "ed-confirm" });
  const notice = h("p", { class: "muted", role: "status" });
  const shared = h("ul", { class: "my-levels" });
  const tags = tierTags(
    client,
    () => controls.state().tier !== null,
    () => drawShared(),
  );
  const controls = listControlsHost("shared", curriculumTiers(), () => drawShared());

  function drawShared(): void {
    const all = sharedLevels.list();
    for (const level of all) tags.ask(level.id, () => sharedLevels.get(level.id));
    const kept = applyList(all, controls.state(), (level) => ({ tier: tags.tier(level.id), difficulty: level.difficulty }));
    controls.show(all.length > 0);
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
              tags.slot(level.id, level.difficulty),
              h("button", { class: "btn btn-small", "aria-label": `Remix ${level.title}`, onClick: () => remix(level.id) }, "Remix"),
              h("button", { class: "btn btn-small", "aria-label": `Remove ${level.title}`, onClick: () => askRemove(level.id, level.title) }, "Remove"),
            ),
          )
        : [all.length ? noMatchRow(controls.clear) : h("li", { class: "muted" }, "Levels opened from a link or code are kept here.")]),
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

  const linkInput = h("input", { type: "text", id: "link-or-code", autocomplete: "off", spellcheck: "false" });
  // What the last try said, directly under the box; each try replaces it.
  const linkNote = h("p", { class: "muted small link-note", role: "status" });
  const linkForm = h(
    "form",
    { class: "link-form", hidden: "" },
    h(
      "div",
      { class: "toolbar" },
      h("label", { for: "link-or-code" }, "A link or code"),
      linkInput,
      h("button", { class: "btn btn-primary", type: "submit" }, "Open"),
      h("button", { class: "btn", type: "button", onClick: () => closeLink() }, "Cancel"),
    ),
    linkNote,
  );
  linkForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const code = linkInput.value.trim() === "" ? null : codeFromText(linkInput.value);
    if (code) location.hash = `#/play/${code}`;
    else linkNote.textContent = linkInput.value.trim() === "" ? "Paste a link or code first." : "That isn't a link or code for a Rank & File level.";
  });
  // Esc closes the form; the app's own Esc (Settings) leaves a key that something here already used
  linkForm.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    closeLink();
    openButton.focus();
  });
  function closeLink(): void {
    linkForm.hidden = true;
    linkInput.value = "";
    linkNote.textContent = "";
  }
  const openButton = h("button", { class: "btn", onClick: () => ((linkForm.hidden = false), linkInput.focus()) }, "Open a link or code");

  root.replaceChildren(
    h(
      "div",
      { class: "editor-list" },
      h("h1", { class: "lessons-title" }, "Shared with me"),
      h("p", { class: "muted" }, "Levels others sent you, kept in this browser. Your stars on them are kept apart from the lessons'."),
      h("div", { class: "toolbar" }, openButton),
      linkForm,
      controls.element,
      notice,
      confirmHost,
      shared,
    ),
  );
  drawShared();
  return () => tags.stop();
}
