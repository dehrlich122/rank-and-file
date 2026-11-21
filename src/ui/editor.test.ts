import { EditorState } from "@codemirror/state";
import { gutterLineClass, type EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { clearMarks, lineMarks, setActiveLine, setCallLine } from "./editor";

/** Just enough of an editor view for setActiveLine: a document, and a dispatch that counts what it is sent. */
function fakeView(doc: string): { view: EditorView; dispatched: number } {
  const state = EditorState.create({ doc });
  const fake = {
    dispatched: 0,
    view: {
      state,
      dispatch: () => {
        fake.dispatched++;
      },
    } as unknown as EditorView,
  };
  return fake;
}

describe("setActiveLine", () => {
  it("marks a line and scrolls to it (two dispatches)", () => {
    const fake = fakeView("pawn.move()\npawn.move()");
    setActiveLine(fake.view, 2);
    expect(fake.dispatched).toBe(2);
  });

  it("only marks, never scrolls, for no line (null)", () => {
    const fake = fakeView("pawn.move()");
    setActiveLine(fake.view, null);
    expect(fake.dispatched).toBe(1);
  });

  it("does not throw for line 0, which the engine reports when no line ran (empty or comment-only code)", () => {
    for (const doc of ["", "# just a comment"]) {
      const fake = fakeView(doc);
      expect(() => setActiveLine(fake.view, 0)).not.toThrow();
      expect(fake.dispatched).toBe(1);
    }
  });

  it("ignores a line past the end of the code", () => {
    const fake = fakeView("pawn.move()");
    setActiveLine(fake.view, 5);
    expect(fake.dispatched).toBe(1);
  });
});

/** A view with no DOM, that applies what is dispatched to a state holding the game's line marks. */
function liveView(doc: string): { view: EditorView; state: () => EditorState } {
  let state = EditorState.create({ doc, extensions: [lineMarks] });
  const view = {
    get state() {
      return state;
    },
    dispatch: (spec: Parameters<EditorState["update"]>[0]) => {
      state = state.update(spec).state;
    },
  } as unknown as EditorView;
  return { view, state: () => state };
}

/** The (1-based) lines whose gutter elements get the call mark's class: what the gutters draw the arrow from. */
function markedLines(state: EditorState): number[] {
  const lines: number[] = [];
  for (const set of state.facet(gutterLineClass)) {
    set.between(0, state.doc.length, (from, _to, marker) => {
      if (marker.elementClass === "cm-call-line") lines.push(state.doc.lineAt(from).number);
    });
  }
  return lines;
}

describe("setCallLine", () => {
  const code = "def f():\n    pass\nf()\nf()";

  it("marks a line, and moves the mark to another", () => {
    const { view, state } = liveView(code);
    setCallLine(view, 3);
    expect(markedLines(state())).toEqual([3]);
    setCallLine(view, 4);
    expect(markedLines(state())).toEqual([4]);
  });

  it("is cleared by null", () => {
    const { view, state } = liveView(code);
    setCallLine(view, 3);
    setCallLine(view, null);
    expect(markedLines(state())).toEqual([]);
  });

  it("is cleared by clearMarks", () => {
    const { view, state } = liveView(code);
    setCallLine(view, 3);
    clearMarks(view);
    expect(markedLines(state())).toEqual([]);
  });

  it("is cleared by an edit of the code, as the running-line highlight is", () => {
    const { view, state } = liveView(code);
    setCallLine(view, 3);
    setActiveLine(view, 2);
    view.dispatch({ changes: { from: 0, insert: "# \n" } });
    expect(markedLines(state())).toEqual([]);
    expect(state().field(lineMarks).decorations.size).toBe(0);
  });

  it("is independent of the running line, which can be the same line or another", () => {
    const { view, state } = liveView(code);
    setCallLine(view, 3);
    setActiveLine(view, 2);
    expect(markedLines(state())).toEqual([3]);
    expect(state().field(lineMarks).decorations.size).toBe(1);
  });

  it("shows nothing and throws nothing for a line outside the code (0, past the end)", () => {
    const { view, state } = liveView(code);
    for (const line of [0, -1, 5, 99]) {
      expect(() => setCallLine(view, line)).not.toThrow();
      expect(markedLines(state())).toEqual([]);
    }
  });
});
