// The Python code editor (CodeMirror 6), plus the markings the game adds:
// the line currently playing back, the line an error came from, and warnings.
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  HighlightStyle,
  IndentContext,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { lintGutter, lintKeymap, setDiagnostics, type Diagnostic } from "@codemirror/lint";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState, Prec, RangeSetBuilder, StateEffect, StateField, type Extension } from "@codemirror/state";
import {
  crosshairCursor,
  Decoration,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  placeholder,
  rectangularSelection,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { settings } from "../settings";

/**
 * CodeMirror's usual "basic setup", minus its autocompletion: the game offers
 * only calls the player has typed (see completion.ts), and never on Enter.
 */
const editorSetup: Extension[] = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  foldGutter(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  bracketMatching(),
  closeBrackets(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, ...lintKeymap]),
];

export interface EditorOptions {
  parent: HTMLElement;
  code: string;
  /** Called on Ctrl+Enter (Cmd+Enter on macOS). */
  onRun?: () => void;
  /** Called after every edit. */
  onChange?: (code: string) => void;
  placeholder?: string;
  compact?: boolean; // smaller, for lesson snippets
  readOnly?: boolean; // for showing code, e.g. the idiomatic-solution comparison
  /** Extra extensions, e.g. callCompletion(...) from completion.ts. */
  extensions?: Extension[];
}

export function createEditor(options: EditorOptions): EditorView {
  const extensions: Extension[] = [
    editorSetup,
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
    followWrapSetting(),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) options.onChange?.(update.state.doc.toString());
    }),
    EditorView.theme({
      "&": { height: "100%", fontSize: options.compact ? "calc(var(--code-size) - 1px)" : "var(--code-size)" },
      ".cm-scroller": { fontFamily: "var(--font-code)", lineHeight: "1.55" },
    }),
    themeFromPage,
    syntaxHighlighting(pythonColors),
  ];
  if (!options.compact) extensions.push(lintGutter());
  if (options.readOnly) extensions.push(EditorState.readOnly.of(true), EditorView.editable.of(false));
  if (options.placeholder) extensions.push(placeholder(options.placeholder));
  if (options.extensions) extensions.push(...options.extensions);
  return new EditorView({ parent: options.parent, doc: options.code, extensions });
}

export interface LineEditorOptions {
  parent: HTMLElement;
  /** Enter: the line to run. */
  onSubmit: (line: string) => void;
  /** Up/Down with no suggestion list open: step through history. Return the line to show, or null. */
  onHistory?: (direction: "older" | "newer") => string | null;
  extensions?: Extension[];
  label?: string;
}

/** A one-line Python input, for the scratch REPL. */
export function createLineEditor(options: LineEditorOptions): EditorView {
  const replaceLine = (view: EditorView, text: string) =>
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, selection: { anchor: text.length } });
  const stepHistory = (direction: "older" | "newer") => (view: EditorView) => {
    const line = options.onHistory?.(direction);
    if (line === null || line === undefined) return false;
    replaceLine(view, line);
    return true;
  };
  return new EditorView({
    parent: options.parent,
    extensions: [
      Prec.high(
        keymap.of([
          {
            key: "Enter",
            run: (view) => {
              const line = view.state.doc.toString();
              replaceLine(view, "");
              options.onSubmit(line);
              return true;
            },
          },
          { key: "ArrowUp", run: stepHistory("older") },
          { key: "ArrowDown", run: stepHistory("newer") },
        ]),
      ),
      // One line only: an edit that would add a line break is refused.
      EditorState.transactionFilter.of((tr) => (tr.newDoc.lines > 1 ? [] : tr)),
      highlightSpecialChars(),
      history(),
      drawSelection(),
      closeBrackets(),
      bracketMatching(),
      keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap]),
      python(),
      syntaxHighlighting(pythonColors),
      themeFromPage,
      EditorView.theme({
        "&": { fontSize: "calc(var(--code-size) - 1px)", flex: "1", minWidth: "0", backgroundColor: "transparent" },
        "&.cm-focused": { outline: "none" },
        ".cm-scroller": { fontFamily: "var(--font-code)", lineHeight: "1.5" },
        ".cm-content": { padding: "0" },
        ".cm-line": { padding: "0" },
      }),
      EditorView.contentAttributes.of({ "aria-label": options.label ?? "Python input" }),
      ...(options.extensions ?? []),
    ],
  });
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

// -- wrapping long lines (QA-015) ------------------------------------------------

/**
 * A wrapped line's extra rows start two columns past the line's own
 * indentation. Starting at the left edge, they'd look dedented, and in Python
 * indentation means something.
 */
const hangingIndent = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = indentRows(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) this.decorations = indentRows(update.view);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

function indentRows(view: EditorView): DecorationSet {
  const { doc } = view.state;
  const indent = new IndentContext(view.state);
  const builder = new RangeSetBuilder<Decoration>();
  const last = doc.lineAt(view.viewport.to).number;
  for (let n = doc.lineAt(view.viewport.from).number; n <= last; n++) {
    const line = doc.line(n);
    // Empty lines never wrap; leaving them alone keeps the placeholder text in place.
    if (!line.length) continue;
    const hang = `--hang: ${indent.lineIndent(line.from) + 2}ch`;
    builder.add(line.from, line.from, Decoration.line({ class: "cm-hang", attributes: { style: hang } }));
  }
  return builder.finish();
}

const wrapped: Extension = [
  EditorView.lineWrapping,
  hangingIndent,
  // The first row keeps CodeMirror's usual 6px; the rows after it start --hang further in.
  EditorView.theme({ ".cm-line.cm-hang": { paddingLeft: "calc(6px + var(--hang))", textIndent: "calc(-1 * var(--hang))" } }),
];

const wrapping = new Compartment();

/** Keeps an editor's wrapping in step with the setting; stops listening when the editor is destroyed. */
const followSetting = ViewPlugin.define((view) => ({
  destroy: settings.subscribe(({ wrapLines }) => {
    if ((wrapping.get(view.state) === wrapped) !== wrapLines) view.dispatch({ effects: wrapping.reconfigure(wrapLines ? wrapped : []) });
  }),
}));

/** Wrap long lines when the Wrap long lines setting is on, and follow it when it changes. */
function followWrapSetting(): Extension {
  return [wrapping.of(settings.get().wrapLines ? wrapped : []), followSetting];
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
  ".cm-tooltip-autocomplete ul li": { fontFamily: "var(--font-code)", padding: "2px 8px" },
  ".cm-tooltip-autocomplete ul li[aria-selected]": { backgroundColor: "var(--accent)", color: "var(--accent-text)" },
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
