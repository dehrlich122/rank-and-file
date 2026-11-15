import { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { setActiveLine } from "./editor";

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
