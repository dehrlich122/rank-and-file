// My levels (M4.2): `#/editor`. The levels made in the editor, saved in this browser, newest edit first.
import { blankDraft } from "../editor/draft";
import { drafts } from "../editor/drafts";
import { confirmStep } from "./dialog";
import { h } from "./dom";

const when = (ms: number): string => new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function mountEditorList(root: HTMLElement): () => void {
  const confirmHost = h("div", { class: "ed-confirm" });
  const list = h("ul", { class: "my-levels" });

  function draw(): void {
    const levels = drafts.list();
    list.replaceChildren(
      ...(levels.length
        ? levels.map((level) =>
            h(
              "li",
              { class: "my-level panel" },
              h("a", { class: "my-level-open", href: `#/editor/${level.id}` }, h("strong", {}, level.title), h("span", { class: "muted small" }, ` · ${level.width} × ${level.height} · edited ${when(level.edited)}`)),
              h("button", { class: "btn btn-small", "aria-label": `Delete ${level.title}`, onClick: () => ask(level.id, level.title) }, "Delete"),
            ),
          )
        : [h("li", { class: "muted" }, "You haven't made a level yet.")]),
    );
  }

  function ask(id: string, name: string): void {
    confirmHost.replaceChildren(
      confirmStep(`Delete "${name}"? This can't be undone.`, "Yes, delete it", "Keep it", (yes) => {
        confirmHost.replaceChildren();
        if (yes) {
          drafts.remove(id);
          draw();
        }
      }),
    );
  }

  const create = () => {
    const draft = blankDraft();
    drafts.save(draft);
    location.hash = `#/editor/${draft.id}`;
  };

  root.replaceChildren(
    h(
      "div",
      { class: "editor-list" },
      h("h1", {}, "My levels"),
      h("p", { class: "muted" }, "Levels you make are kept in this browser. Nothing leaves it unless you export or share one."),
      h("div", { class: "toolbar" }, h("button", { class: "btn btn-primary", onClick: create }, "New level")),
      confirmHost,
      list,
    ),
  );
  draw();
  return () => {};
}
