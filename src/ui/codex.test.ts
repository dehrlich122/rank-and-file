import { python } from "@codemirror/lang-python";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { chapters, codexHistory } from "../content";
import { codexNameAt } from "./codex";

describe("codexNameAt: what a hover over code looks up", () => {
  const doc = "pawn.move(2)\nprint(pawn.position)\nother.move()\n# pawn.wait()";
  const state = EditorState.create({ doc, extensions: [python()] });
  const at = (text: string, offset = 1) => codexNameAt(state, doc.indexOf(text) + offset, 1, "pawn")?.name ?? null;

  it("finds the piece's abilities by their full name", () => {
    expect(at("move(2)")).toBe("pawn.move");
    expect(at("position")).toBe("pawn.position");
  });

  it("finds plain names, such as built-ins", () => {
    expect(at("print")).toBe("print");
  });

  it("ignores methods of anything but the piece, and comments", () => {
    expect(at("move()")).toBeNull();
    expect(at("wait")).toBeNull();
  });
});

describe("codexHistory: the levels that count as taught so far (docs/Codex.md)", () => {
  const curriculum = chapters.filter((chapter) => chapter.curriculum);
  const first = curriculum[0]!;
  const practice = chapters.find((chapter) => !chapter.curriculum)!;

  it("counts a curriculum level and the levels before it, numbered", () => {
    const third = first.levels[2]!;
    const history = codexHistory(third.id);
    expect(history.map((level) => level.label)).toEqual(first.levels.slice(0, 3).map((level, i) => `${first.chapter}.${i + 1} ${level.title}`));
    expect(history.at(-1)!.api).toEqual(third.data.api);
  });

  it("counts the curriculum listed before the Testing ground, then its own levels up to this one", () => {
    const level = practice.levels[3]!;
    const history = codexHistory(level.id);
    const before = chapters.slice(0, chapters.indexOf(practice)).filter((chapter) => chapter.curriculum);
    expect(history).toHaveLength(before.reduce((sum, chapter) => sum + chapter.levels.length, 0) + 4);
    expect(history.at(-1)!.label).toBe(`${practice.title}: ${level.title}`);
  });

  it("sends each level's runnable snippets, and no other code blocks", () => {
    const lessons = codexHistory(first.levels.at(-1)!.id).flatMap((level) => level.snippets);
    expect(lessons.length).toBeGreaterThan(0);
    expect(lessons.every((code) => !code.startsWith("```"))).toBe(true);
  });
});
