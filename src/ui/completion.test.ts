import { CompletionContext } from "@codemirror/autocomplete";
import { python } from "@codemirror/lang-python";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { callsTouched, KnownCalls, suggestCalls, type CompletionOptions } from "./completion";

const stateOf = (doc: string) => EditorState.create({ doc, extensions: [python()] });

function suggestionsAt(doc: string, known: string[], api = ["move", "turn_left"]): string[] | null {
  const calls = new KnownCalls();
  known.forEach((call) => calls.add(call));
  const options: CompletionOptions = { known: calls, piece: () => "pawn", api: () => api };
  const state = stateOf(doc);
  const result = suggestCalls(new CompletionContext(state, doc.length, false), options);
  return result ? result.options.map((option) => option.label) : null;
}

describe("callsTouched: which calls count as typed", () => {
  const doc = "pawn.move(3)\nprint('hi')\n# pawn.turn_left()\nx = len(y)";
  const state = stateOf(doc);
  const lineRange = (n: number): [number, number] => {
    const line = state.doc.line(n);
    return [line.from, line.to];
  };

  it("finds method calls and plain calls in the edited range", () => {
    expect(callsTouched(state, [lineRange(1)])).toEqual(["pawn.move"]);
    expect(callsTouched(state, [lineRange(2)])).toEqual(["print"]);
    expect(callsTouched(state, [lineRange(4)])).toEqual(["len"]);
  });

  it("ignores calls in comments, and calls nobody touched", () => {
    expect(callsTouched(state, [lineRange(3)])).toEqual([]);
    expect(callsTouched(state, [])).toEqual([]);
  });

  it("doesn't count editing only the arguments of an existing call", () => {
    const three = doc.indexOf("3");
    expect(callsTouched(state, [[three, three + 1]])).toEqual([]);
  });

  it("counts typing the opening parenthesis", () => {
    const paren = doc.indexOf("(");
    expect(callsTouched(state, [[paren, paren + 1]])).toEqual(["pawn.move"]);
  });
});

describe("suggestCalls: what's offered", () => {
  it("offers nothing until a call has been typed", () => {
    expect(suggestionsAt("pawn.", [])).toBeNull();
  });

  it("offers the piece's typed methods after the dot, narrowing as you type", () => {
    expect(suggestionsAt("pawn.", ["pawn.move", "pawn.turn_left"])).toEqual(["move()", "turn_left()"]);
    expect(suggestionsAt("pawn.t", ["pawn.move", "pawn.turn_left"])).toEqual(["turn_left()"]);
    expect(suggestionsAt("pawn.x", ["pawn.move"])).toBeNull();
  });

  it("never offers a typo, or a method the level hasn't unlocked", () => {
    expect(suggestionsAt("pawn.", ["pawn.mvoe"])).toBeNull();
    expect(suggestionsAt("pawn.", ["pawn.turn_right"], ["move"])).toBeNull();
    expect(suggestionsAt("knight.", ["knight.move"])).toBeNull(); // not this level's piece
  });

  it("offers typed builtins from the first letter, and closes when they're ruled out", () => {
    expect(suggestionsAt("p", ["print"])).toEqual(["print()"]);
    expect(suggestionsAt("pa", ["print"])).toBeNull();
    expect(suggestionsAt("pr", ["prnit"])).toBeNull(); // a typo isn't a builtin
  });

  it("offers the player's own functions once they've been called", () => {
    expect(suggestionsAt("def hop():\n    pass\nh", ["hop"])).toEqual(["hop()"]);
    expect(suggestionsAt("h", ["hop"])).toBeNull(); // no such def
  });

  it("stays quiet inside comments and strings", () => {
    expect(suggestionsAt("# p", ["print"])).toBeNull();
    expect(suggestionsAt("print('p", ["print"])).toBeNull();
    expect(suggestionsAt('x = f"{p', ["print"])).toBeNull();
  });
});
