// Autocomplete that only offers calls you've already typed yourself, and only
// if they're real (QA-003).
//
// - A call becomes "known" when you type it: the tracker watches edits made by
//   typing or pasting and records every call whose name or opening "(" you
//   touched. Starter code and lesson examples never count, and a known call
//   stays known for the level even if you delete the line.
// - "Real" means it can work: a method must be one of the piece's abilities in
//   this level (so a typo like `pawn.mvoe()` is never offered); a plain call
//   must be a Python builtin or a function defined with `def` in the code.
// - Suggestions narrow as you type, never appear inside comments or strings,
//   and only Tab accepts one. Enter always starts a new line.
import {
  acceptCompletion,
  autocompletion,
  closeCompletion,
  CompletionContext,
  moveCompletionSelection,
  type Completion,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { Prec, type EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

/** The calls typed so far: "pawn.move" for methods, "print" for plain calls. */
export class KnownCalls {
  private readonly calls = new Set<string>();

  add(call: string): void {
    this.calls.add(call);
  }

  clear(): void {
    this.calls.clear();
  }

  /** Methods called on `object`, e.g. methodsOf("pawn") -> ["move", "turn_left"]. */
  methodsOf(object: string): string[] {
    const prefix = `${object}.`;
    return [...this.calls].filter((call) => call.startsWith(prefix)).map((call) => call.slice(prefix.length));
  }

  plainCalls(): string[] {
    return [...this.calls].filter((call) => !call.includes("."));
  }
}

export interface CompletionOptions {
  known: KnownCalls;
  /** The piece's variable name in this level ("pawn"), or null if there's no piece. */
  piece: () => string | null;
  /** The piece's abilities in this level. */
  api: () => string[];
}

/** Everything the editor needs: the tracker, the suggestion source, and Tab-only keys. */
export function callCompletion(options: CompletionOptions): Extension[] {
  return [
    EditorView.updateListener.of((update) => {
      if (!update.docChanged || !update.transactions.some((tr) => tr.isUserEvent("input"))) return;
      const ranges: Array<[number, number]> = [];
      update.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => ranges.push([fromB, toB]));
      for (const call of callsTouched(update.state, ranges)) options.known.add(call);
    }),
    autocompletion({
      override: [(context) => suggestCalls(context, options)],
      defaultKeymap: false, // our keymap below: Tab accepts, Enter never does
      icons: false,
      addToOptions: [{ render: tabLabel, position: 90 }],
    }),
    Prec.highest(
      keymap.of([
        { key: "Tab", run: acceptCompletion }, // when no list is open, Tab falls through to indenting
        { key: "ArrowDown", run: moveCompletionSelection(true) },
        { key: "ArrowUp", run: moveCompletionSelection(false) },
        { key: "PageDown", run: moveCompletionSelection(true, "page") },
        { key: "PageUp", run: moveCompletionSelection(false, "page") },
        { key: "Escape", run: closeCompletion },
      ]),
    ),
  ];
}

/** Calls whose name or opening parenthesis lies in one of `ranges` (positions in `state`). */
export function callsTouched(state: EditorState, ranges: Array<[number, number]>): string[] {
  const tree = ensureSyntaxTree(state, state.doc.length, 200) ?? syntaxTree(state);
  const found: string[] = [];
  tree.iterate({
    enter(node) {
      if (node.name !== "CallExpression") return;
      const callee = node.node.firstChild;
      const args = node.node.getChild("ArgList");
      if (!callee || !args) return;
      const from = callee.from;
      const to = args.from + 1; // the name and the "(" (edits inside the arguments don't count)
      const touches = ([start, end]: [number, number]) =>
        start === end ? start >= from && start <= to : start < to && end > from; // a deletion leaves an empty range
      if (!ranges.some(touches)) return;
      const name = callee.name === "VariableName" ? state.sliceDoc(callee.from, callee.to) : memberName(state, callee);
      if (name) found.push(name);
    },
  });
  return found;
}

type SyntaxNode = ReturnType<typeof syntaxTree>["topNode"];

/** "pawn.move" for the member expression `pawn.move`, or null if it's anything else. The Codex's hover uses it too. */
export function memberName(state: EditorState, node: SyntaxNode): string | null {
  const object = node.firstChild;
  const property = node.getChild("PropertyName");
  if (node.name !== "MemberExpression" || object?.name !== "VariableName" || !property) return null;
  return `${state.sliceDoc(object.from, object.to)}.${state.sliceDoc(property.from, property.to)}`;
}

/** The completion source: known, real calls that start with what's typed. */
export function suggestCalls(context: CompletionContext, options: CompletionOptions): CompletionResult | null {
  const { state, pos } = context;
  for (let node: { name: string; parent: unknown } | null = syntaxTree(state).resolveInner(pos, -1); node; node = node.parent as typeof node) {
    if (node.name === "Comment" || node.name === "String" || node.name === "FormatString") return null;
  }

  const member = context.matchBefore(/[A-Za-z_]\w*\.\w*$/);
  if (member) {
    const dot = member.text.indexOf(".");
    const object = member.text.slice(0, dot);
    const typed = member.text.slice(dot + 1);
    const piece = options.piece();
    const api = options.api();
    const methods = options.known
      .methodsOf(object)
      .filter((method) => object === piece && api.includes(method) && method.startsWith(typed));
    return result(member.from + dot + 1, methods, "method");
  }

  const word = context.matchBefore(/[A-Za-z_]\w*$/);
  if (!word || state.sliceDoc(word.from - 1, word.from) === ".") return null;
  const defined = functionsDefined(state);
  const calls = options.known
    .plainCalls()
    .filter((name) => (PYTHON_BUILTINS.has(name) || defined.has(name)) && name.startsWith(word.text));
  return result(word.from, calls, "function");
}

function result(from: number, names: string[], type: string): CompletionResult | null {
  if (names.length === 0) return null;
  // No `validFor`: the source runs again on every keystroke, so typing more
  // letters narrows the list and closes it when nothing matches.
  return { from, filter: false, options: names.sort().map((name) => callOption(name, type)) };
}

/** Inserts `name()` with the cursor after the closing parenthesis (QA-033). */
function callOption(name: string, type: string): Completion {
  return {
    label: `${name}()`,
    type,
    apply: (view, _completion, from, to) => {
      const hasParen = view.state.sliceDoc(to, to + 1) === "(";
      const insert = hasParen ? name : `${name}()`;
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + name.length + 2 },
        userEvent: "input.complete",
      });
    },
  };
}

function functionsDefined(state: EditorState): Set<string> {
  const names = new Set<string>();
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== "FunctionDefinition") return;
      const name = node.node.getChild("VariableName");
      if (name) names.add(state.sliceDoc(name.from, name.to));
    },
  });
  return names;
}

/** A faint "Tab" after each option; CSS shows it only on the highlighted one. */
function tabLabel(): Node {
  const label = document.createElement("span");
  label.className = "cm-tab-hint";
  label.textContent = "Tab";
  return label;
}

/** Python's built-in functions (what counts as a "real" plain call). */
const PYTHON_BUILTINS = new Set([
  "abs", "aiter", "all", "anext", "any", "ascii", "bin", "bool", "breakpoint", "bytearray", "bytes",
  "callable", "chr", "classmethod", "compile", "complex", "delattr", "dict", "dir", "divmod",
  "enumerate", "eval", "exec", "filter", "float", "format", "frozenset", "getattr", "globals",
  "hasattr", "hash", "help", "hex", "id", "input", "int", "isinstance", "issubclass", "iter", "len",
  "list", "locals", "map", "max", "memoryview", "min", "next", "object", "oct", "open", "ord", "pow",
  "print", "property", "range", "repr", "reversed", "round", "set", "setattr", "slice", "sorted",
  "staticmethod", "str", "sum", "super", "tuple", "type", "vars", "zip",
]); // prettier-ignore
