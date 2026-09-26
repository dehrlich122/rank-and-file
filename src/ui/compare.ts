// The idiomatic-solution comparison (M2): your code beside a reference
// solution, with a short note on why it's written that way.
//
// It only opens once a level is solved, or after giving up. The solution is
// fetched when it opens (content.loadSolution), and the dialog is removed
// when it closes, so nothing of it lingers in the page.
import type { EditorView } from "@codemirror/view";
import { marked } from "marked";
import { loadSolution } from "../content";
import { dialogHead, modal } from "./dialog";
import { h } from "./dom";
import { createEditor } from "./editor";

export function openComparison(levelId: string, yourCode: string): void {
  const editors: EditorView[] = [];
  const codePane = (title: string, code: string, className: string) => {
    const host = h("div", { class: "editor compare-code" });
    editors.push(createEditor({ parent: host, code: code.trimEnd(), readOnly: true }));
    return h("section", { class: className }, h("h3", {}, title), host);
  };
  const body = h("div", { class: "compare-body" }, h("p", { class: "muted" }, "Loading the solution…"));
  const dialog: HTMLDialogElement = h(
    "dialog",
    { class: "compare-dialog", "aria-labelledby": "compare-title" },
    dialogHead("compare-title", "Compare with an idiomatic solution", "Close", () => dialog.close()),
    body,
  );
  const open = modal(dialog);
  dialog.addEventListener("close", () => {
    for (const editor of editors) editor.destroy();
    dialog.remove();
  });
  document.body.append(dialog);
  open();

  void loadSolution(levelId).then(
    (solution) => {
      if (!dialog.open) return;
      if (!solution) {
        body.replaceChildren(h("p", {}, "This level doesn't have an idiomatic solution yet."));
        return;
      }
      const note = h("div", { class: "compare-note" });
      // The notes are our own trusted content, like lessons.
      note.insertAdjacentHTML("beforeend", marked.parse(solution.note, { async: false }));
      body.replaceChildren(
        h(
          "div",
          { class: "compare-columns" },
          codePane("Your code", yourCode, "compare-yours"),
          codePane("An idiomatic solution", solution.code, "compare-idiomatic"),
        ),
        note,
      );
    },
    (error: unknown) => body.replaceChildren(h("p", {}, `The solution couldn't be loaded: ${String(error)}`)),
  );
}
