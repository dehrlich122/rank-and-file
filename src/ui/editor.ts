// The Python code editor (CodeMirror 6).
import { python } from "@codemirror/lang-python";
import { indentWithTab } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { EditorView, basicSetup } from "codemirror";

export interface EditorOptions {
  parent: HTMLElement;
  code: string;
  /** Called on Ctrl+Enter (Cmd+Enter on macOS). */
  onRun?: () => void;
}

export function createEditor({ parent, code, onRun }: EditorOptions): EditorView {
  return new EditorView({
    parent,
    doc: code,
    extensions: [
      basicSetup,
      python(),
      indentUnit.of("    "),
      keymap.of([indentWithTab]),
      Prec.highest(
        keymap.of([
          {
            key: "Mod-Enter",
            run: () => {
              onRun?.();
              return true;
            },
          },
        ]),
      ),
      EditorView.theme({
        "&": { height: "100%", fontSize: "15px" },
        ".cm-scroller": { fontFamily: "var(--font-code)", lineHeight: "1.55" },
      }),
    ],
  });
}

export function getCode(view: EditorView): string {
  return view.state.doc.toString();
}

export function setCode(view: EditorView, code: string): void {
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } });
}
