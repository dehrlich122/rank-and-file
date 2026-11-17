import { marked } from "marked";
import { describe, expect, it } from "vitest";
import { sandboxLoader, splitIntoSteps, type LessonContext } from "./lesson";

const FENCE = "```";

/** The text of each step, without Markdown syntax, for easy comparison. */
function steps(markdown: string): string[][] {
  return splitIntoSteps(marked.lexer(markdown)).map((step) =>
    step.filter((token) => token.type !== "space").map((token) => ("text" in token ? String(token.text) : token.type)),
  );
}

describe("splitIntoSteps", () => {
  it("ends a step after each runnable snippet", () => {
    const lesson = [
      "# Title",
      "Intro.",
      `${FENCE}python run\nfirst()\n${FENCE}`,
      "Middle.",
      `${FENCE}python run\nsecond()\n${FENCE}`,
    ].join("\n\n");
    expect(steps(lesson)).toEqual([
      ["Title", "Intro.", "first()"],
      ["Middle.", "second()"],
    ]);
  });

  it("puts text after the last snippet into the last step", () => {
    const lesson = [`Intro.`, `${FENCE}python run\nfirst()\n${FENCE}`, "Closing words."].join("\n\n");
    expect(steps(lesson)).toEqual([["Intro.", "first()", "Closing words."]]);
  });

  it("treats a snippet that's meant to fail as a snippet too", () => {
    const lesson = [`${FENCE}python run\nok()\n${FENCE}`, "Now break it:", `${FENCE}python run error\nbad(\n${FENCE}`].join("\n\n");
    expect(steps(lesson)).toHaveLength(2);
  });

  it("keeps ordinary code blocks inside a step, and a lesson without snippets is one step", () => {
    const lesson = ["Intro.", `${FENCE}python\njust_shown()\n${FENCE}`, "More."].join("\n\n");
    expect(steps(lesson)).toEqual([["Intro.", "just_shown()", "More."]]);
  });
});

describe("sandboxLoader", () => {
  /** A lesson context whose client records the requests it is sent. */
  function recording(piece?: string) {
    const calls: Array<[string, unknown]> = [];
    const client = { ready: () => Promise.resolve(), call: (kind: string, args: unknown) => (calls.push([kind, args]), Promise.resolve({})) };
    return { calls, context: { client, api: ["jump"], piece, codex: () => null } as unknown as LessonContext };
  }

  it("asks for the level's piece, which a knight level's snippets run", async () => {
    const { calls, context } = recording("knight");
    await sandboxLoader(context)();
    expect(calls).toEqual([["loadSandbox", { api: ["jump"], board: undefined, piece: "knight" }]]);
  });

  it("leaves the piece out for a level that names none, which runs the pawn", async () => {
    const { calls, context } = recording();
    await sandboxLoader(context)();
    expect((calls[0]![1] as { piece?: string }).piece).toBeUndefined();
  });
});
