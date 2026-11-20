import { python } from "@codemirror/lang-python";
import { EditorState } from "@codemirror/state";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chapters, codexChapters, levelLabel } from "../content";
import type { CodexChapter } from "../py/protocol";
import type { CodexEntry } from "../py/protocol";
import { codexNameAt, renderCodex } from "./codex";
import { asFake, fakeDocument } from "./dom.fake";

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

  it("finds a keyword by its own name, and `elif` and `else` as `if`", () => {
    const lines = ["for i in range(2):", "    if i:", "        continue", "    elif i > 5:", "        break", "    else:", "        pass", "while x:", "    pass", "def f():", "    return 1"];
    const text = lines.join("\n");
    const code = EditorState.create({ doc: text, extensions: [python()] });
    const name = (word: string) => codexNameAt(code, text.indexOf(word) + 1, 1, "pawn")?.name ?? null;
    expect(["for", "if", "continue", "elif", "break", "else", "while", "def", "return"].map(name)).toEqual(
      ["for", "if", "continue", "if", "break", "if", "while", "def", "return"],
    );
    expect(name("pass")).toBe("pass"); // a candidate like any keyword: the lookup finds no entry for it
    expect(name("range")).toBe("range");
  });
});

describe("renderCodex: the groups", () => {
  beforeEach(() => vi.stubGlobal("document", fakeDocument));
  afterEach(() => vi.unstubAllGlobals());

  const entry = (name: string, kind: CodexEntry["kind"]): CodexEntry => ({
    name, kind, calls: [name], paragraphs: ["Does something."], args: [], returns: "", example: "", introduced: chapters[0]!.levels[0]!.id, new: false,
  });
  const titles = (entries: CodexEntry[]) => asFake(renderCodex(entries, "pawn").element).all("h3").map((title) => title.text);

  it("lists the keywords in a group of their own, after the others", () => {
    const all = [entry("for", "keyword"), entry("str.upper", "method"), entry("print", "builtin"), entry("pawn.move", "ability")];
    expect(titles(all)).toEqual(["Your pawn", "Python", "Text", "Keywords"]);
  });

  it("splits the methods by owner, and puts the kinds of value last", () => {
    const all = [entry("tuple", "value"), entry("for", "keyword"), entry("list.append", "method"), entry("str.upper", "method"), entry("print", "builtin")];
    expect(titles(all)).toEqual(["Python", "Text", "Lists", "Keywords", "Kinds of value"]);
  });

  it("keeps the kinds of value out of the hover lookup but lists them in the tab", () => {
    const view = renderCodex([entry("list", "value"), entry("print", "builtin")], "pawn");
    expect([...view.entries.keys()]).toEqual(["print"]);
    expect(asFake(view.element).find("codex-entry")).toHaveLength(2); // both are in the tab, so `show("list")` has an entry to open
  });

  it("shows no Keywords group when no keyword is unlocked", () => {
    expect(titles([entry("print", "builtin")])).toEqual(["Python"]);
  });

  it("writes a keyword's form where a call would be", () => {
    const code = asFake(renderCodex([entry("while", "keyword")], "pawn").element).find("codex-call");
    expect(code.map((call) => call.text)).toEqual(["while"]);
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
