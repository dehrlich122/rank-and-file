// The Python code editor (CodeMirror 6), plus the markings the game adds:
// the line currently playing back, the line an error came from, and warnings.
import { indentWithTab } from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import { HighlightStyle, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { lintGutter, setDiagnostics, type Diagnostic } from "@codemirror/lint";
import { Prec, StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, keymap, placeholder, type DecorationSet } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { EditorView, basicSetup } from "codemirror";

export interface EditorOptions {
  parent: HTMLElement;
  code: string;
  /** Called on Ctrl+Enter (Cmd+Enter on macOS). */
  onRun?: () => void;
  /** Called after every edit. */
  onChange?: (code: string) => void;
  placeholder?: string;
  compact?: boolean; // smaller, for lesson snippets
}

export function createEditor(options: EditorOptions): EditorView {
  const extensions: Extension[] = [
    basicSetup,
    python(),
    indentUnit.of("    "),
    keymap.of([indentWithTab]),
    Prec.highest(
      keymap.of([
        {
          key: "Mod-Enter",
          run: () => {
            options.onRun?.();
            return true;
          },
        },
      ]),
    ),
    lineMarks,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) options.onChange?.(update.state.doc.toString());
    }),
    EditorView.theme({
      "&": { height: "100%", fontSize: options.compact ? "14px" : "15px" },
      ".cm-scroller": { fontFamily: "var(--font-code)", lineHeight: "1.55" },
    }),
    themeFromPage,
    syntaxHighlighting(pythonColors),
  ];
  if (!options.compact) extensions.push(lintGutter());
  if (options.placeholder) extensions.push(placeholder(options.placeholder));
  return new EditorView({ parent: options.parent, doc: options.code, extensions });
}

export function getCode(view: EditorView): string {
  return view.state.doc.toString();
}

export function setCode(view: EditorView, code: string): void {
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } });
}

/** Highlight the line being played back (null to clear). */
export function setActiveLine(view: EditorView, line: number | null): void {
  view.dispatch({ effects: setActive.of(line) });
  if (line !== null && line <= view.state.doc.lines) {
    view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.line(line).from, { y: "nearest" }) });
  }
}

/** Mark the line an error came from (null to clear). */
export function setErrorLine(view: EditorView, line: number | null): void {
  view.dispatch({ effects: setError.of(line) });
}

export interface Mark {
  line: number;
  message: string;
  severity: "warning" | "error";
}

/** Show warnings and errors in the gutter, with the message on hover. */
export function setMarks(view: EditorView, marks: Mark[]): void {
  const doc = view.state.doc;
  const diagnostics: Diagnostic[] = marks
    .filter((mark) => mark.line >= 1 && mark.line <= doc.lines)
    .map((mark) => {
      const line = doc.line(mark.line);
      return { from: line.from, to: line.to, severity: mark.severity, message: mark.message };
    });
  view.dispatch(setDiagnostics(view.state, diagnostics));
}

export function clearMarks(view: EditorView): void {
  setActiveLine(view, null);
  setErrorLine(view, null);
  setMarks(view, []);
}

// -- line decorations -----------------------------------------------------------

const setActive = StateEffect.define<number | null>();
const setError = StateEffect.define<number | null>();

interface Marked {
  active: number | null;
  error: number | null;
  decorations: DecorationSet;
}

const activeLine = Decoration.line({ class: "cm-step-line" });
const errorLine = Decoration.line({ class: "cm-error-line" });

const lineMarks = StateField.define<Marked>({
  create: () => ({ active: null, error: null, decorations: Decoration.none }),
  update(value, transaction) {
    let { active, error } = value;
    if (transaction.docChanged) {
      active = null; // the code changed, so old highlights no longer apply
      error = null;
    }
    for (const effect of transaction.effects) {
      if (effect.is(setActive)) active = effect.value;
      if (effect.is(setError)) error = effect.value;
    }
    if (active === value.active && error === value.error && !transaction.docChanged) return value;
    const doc = transaction.state.doc;
    const ranges = [];
    const valid = (line: number | null): line is number => line !== null && line >= 1 && line <= doc.lines;
    if (valid(active) && active !== error) ranges.push(activeLine.range(doc.line(active).from));
    if (valid(error)) ranges.push(errorLine.range(doc.line(error).from));
    ranges.sort((a, b) => a.from - b.from);
    return { active, error, decorations: Decoration.set(ranges) };
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
});

// -- colours ---------------------------------------------------------------------
// Both use the page's CSS variables (src/styles.css), so the editor follows
// the light and dark themes automatically.

const themeFromPage = EditorView.theme({
  "&": { color: "var(--text)", backgroundColor: "var(--panel)" },
  ".cm-content": { caretColor: "var(--text)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--text)" },
  ".cm-gutters": { backgroundColor: "var(--code-bg)", color: "var(--muted)", borderRight: "1px solid var(--border)" },
  ".cm-activeLine": { backgroundColor: "var(--active-line)" },
  ".cm-activeLineGutter": { backgroundColor: "var(--active-line)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "var(--selection)" },
  ".cm-matchingBracket": { backgroundColor: "var(--selection)", outline: "none" },
  ".cm-tooltip": { backgroundColor: "var(--panel)", color: "var(--text)", border: "1px solid var(--border)" },
});

const pythonColors = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword, tags.definitionKeyword, tags.operatorKeyword], color: "var(--syn-keyword)" },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--syn-string)" },
  { tag: [tags.number, tags.bool, tags.null], color: "var(--syn-number)" },
  { tag: tags.comment, color: "var(--syn-comment)", fontStyle: "italic" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: "var(--syn-function)" },
  { tag: [tags.definition(tags.variableName), tags.definition(tags.function(tags.variableName))], color: "var(--syn-definition)" },
  { tag: [tags.className, tags.definition(tags.className)], color: "var(--syn-class)" },
  { tag: [tags.self, tags.special(tags.variableName)], color: "var(--syn-keyword)" },
]);
