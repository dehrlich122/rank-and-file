import { marked } from "marked";
import { describe, expect, it } from "vitest";
import { splitIntoSteps } from "./lesson";

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
