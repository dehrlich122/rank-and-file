import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { blankDraft } from "./draft";
import { copyOfLevel, testPlaySource } from "./starts";

const LESSON_LEVEL = `
id: ch99-l01
chapter: 99
title: The Test
trains: "Everything"
brief: Get there.
map: |
  . G
  P .
api: [move]
par: {lines: 2}
constraints: {max_lines: 4}
hints: ["secret nudge", "secret reminder"]
starter: "# secret starter"
mastery: true
lesson: ch99/ch99-l01.md
lesson_board:
  map: |
    . .
    P .
`;

describe("copying a lesson level", () => {
  const copy = copyOfLevel(parse(LESSON_LEVEL, { version: "1.1" }), "my-copy");

  it("keeps the board, the abilities and the rules, under a new id and title", () => {
    expect(copy.id).toBe("my-copy");
    expect(copy.title).toBe("The Test (copy)");
    expect([copy.width, copy.height, copy.goal, copy.api]).toEqual([2, 2, [1, 1], ["move"]]);
    expect(copy.extra).toMatchObject({ par: { lines: 2 }, constraints: { max_lines: 4 } });
  });

  it("never keeps the hints, the starter code, the lesson, or what makes it part of a chapter", () => {
    expect(Object.keys(copy.extra).sort()).toEqual(["constraints", "par"]);
    expect(JSON.stringify(copy)).not.toMatch(/secret|lesson|mastery/);
  });

  it("gets a fresh id when none is given", () => {
    expect(copyOfLevel(parse(LESSON_LEVEL, { version: "1.1" })).id).toMatch(/^my-/);
  });
});

describe("test-play", () => {
  it("opens a draft as a level with no chapter or lesson", () => {
    const draft = { ...blankDraft(4, 4, "my-x"), title: "Mine", trains: "walking" };
    const source = testPlaySource(draft);
    expect(source).toMatchObject({ id: "my-x", chapter: 0, title: "Mine", trains: "walking", mastery: false, lesson: "" });
    expect(source.data).toMatchObject({ id: "my-x", title: "Mine", piece: "pawn" });
  });
});
