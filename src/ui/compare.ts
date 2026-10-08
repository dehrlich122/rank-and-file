// The idiomatic-solution comparison (M2): your code beside a reference
// solution, with a short note on why it's written that way.
//
// It only opens once a level is solved, or after giving up. The solution is
// fetched when it opens (content.loadSolution), and the dialog is removed
// when it closes, so nothing of it lingers in the page.
import type { EditorView } from "@codemirror/view";
import { marked } from "marked";
import { loadSolution, type Solution } from "../content";
import { dialogHead, modal } from "./dialog";
import { h } from "./dom";
import { createEditor } from "./editor";

/** Where a level's solution comes from, and what to call it: the curriculum's idiomatic solution, or an author's own (M4.3). */
export interface SolutionSource {
  name: string; // "an idiomatic solution", "the author's solution"
  explained: boolean; // it comes with a note on why it's written that way
  load(): Promise<Solution | null>;
}

/** The curriculum's reference solution for a level: a lazy file, fetched only when the comparison opens. */
export const idiomaticSolution = (levelId: string): SolutionSource => ({ name: "an idiomatic solution", explained: true, load: () => loadSolution(levelId) });

const capitalised = (text: string): string => text.replace(/^./, (c) => c.toUpperCase());

export function openComparison(source: SolutionSource, yourCode: string): void {
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
    dialogHead("compare-title", `Compare with ${source.name}`, "Close", () => dialog.close()),
    body,
  );
  const open = modal(dialog);
  dialog.addEventListener("close", () => {
    for (const editor of editors) editor.destroy();
    dialog.remove();
  });
  document.body.append(dialog);
  open();

  void source.load().then(
    (solution) => {
      if (!dialog.open) return;
      if (!solution) {
        body.replaceChildren(h("p", {}, `This level doesn't have ${source.name} yet.`));
        return;
      }
      // The curriculum's notes are our own trusted content, like lessons. An author's solution has no note, and nothing
      // that arrives in a shared level ever reaches insertAdjacentHTML.
      const note = solution.note ? h("div", { class: "compare-note" }) : null;
      note?.insertAdjacentHTML("beforeend", marked.parse(solution.note, { async: false }));
      body.replaceChildren(
        h(
          "div",
          { class: "compare-columns" },
          codePane("Your code", yourCode, "compare-yours"),
          codePane(capitalised(source.name), solution.code, "compare-idiomatic"),
        ),
        ...(note ? [note] : []),
      );
    },
    (error: unknown) => body.replaceChildren(h("p", {}, `The solution couldn't be loaded: ${String(error)}`)),
  );
}
