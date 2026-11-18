import { python } from "@codemirror/lang-python";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { chapters, codexChapters, levelLabel } from "../content";
import type { CodexChapter } from "../py/protocol";
import { codexNameAt } from "./codex";

describe("codexNameAt: what a hover over code looks up", () => {
  const doc = "pawn.move(2)\nprint(pawn.position)\nother.move()\n# pawn.wait()";
  const state = EditorState.create({ doc, extensions: [python()] });
  const at = (text: string, offset = 1) => codexNameAt(state, doc.indexOf(text) + offset, 1, "pawn")?.name ?? null;

  it("finds the piece's abilities by their full name", () => {
    expect(at("move(2)")).toBe("pawn.move");
    expect(at("position")).toBe("pawn.position");
  });

  it("finds a knight's abilities the same way", () => {
    const text = "knight.jump(1, 2)\nknight.look(1, 2)";
    const knight = EditorState.create({ doc: text, extensions: [python()] });
    const name = (word: string) => codexNameAt(knight, text.indexOf(word) + 1, 1, "knight")?.name ?? null;
    expect(name("jump")).toBe("knight.jump");
    expect(name("look")).toBe("knight.look");
  });

  it("finds plain names, such as built-ins", () => {
    expect(at("print")).toBe("print");
  });

  it("looks up another object's methods as methods of text, and ignores comments", () => {
    expect(at("move()")).toBe("str.move"); // the Codex only has an entry if a lesson taught it
    expect(at("wait")).toBeNull();
  });

  it("finds a text method on any value", () => {
    const text = 'pawn.read().upper()\nname.strip()';
    const names = EditorState.create({ doc: text, extensions: [python()] });
    expect(codexNameAt(names, text.indexOf("upper") + 1, 1, "pawn")?.name).toBe("str.upper");
    expect(codexNameAt(names, text.indexOf("strip") + 1, 1, "pawn")?.name).toBe("str.strip");
  });
});

describe("what the Codex is told about levels", () => {
  const curriculum = chapters.find((chapter) => chapter.curriculum)!;
  const practice = chapters.find((chapter) => !chapter.curriculum)!;

  it("names a curriculum level by its number, and a Testing-ground level by its chapter", () => {
    const third = curriculum.levels[2]!;
    expect(levelLabel(third.id)).toBe(`${curriculum.chapter}.3 ${third.title}`);
    expect(levelLabel(practice.levels[0]!.id)).toBe(`${practice.title}: ${practice.levels[0]!.title}`);
  });

  it("sends every chapter in play order, with each level's file and lesson", () => {
    // challenge sets (M4.4) are sent too, as chapter 0 outside the curriculum after their tier: content.test.ts checks them
    const isSet = (chapter: CodexChapter) => !chapter.curriculum && chapter.levels.every((level) => (level.data as { set?: string }).set);
    const sent = codexChapters().filter((chapter) => !isSet(chapter));
    expect(sent.map((chapter) => chapter.levels.map((level) => level.id))).toEqual(chapters.map((chapter) => chapter.levels.map((level) => level.id)));
    expect(sent.every((chapter) => chapter.levels.every((level) => level.lesson.length > 0 && level.data))).toBe(true);
  });
});
