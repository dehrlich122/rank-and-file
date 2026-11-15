import { describe, expect, it } from "vitest";
import { boardsText, starsText } from "./editorList";

describe("shared level rows", () => {
  it("words the stars", () => {
    expect(starsText(0)).toBe("not solved yet");
    expect(starsText(2)).toBe("★★☆");
    expect(starsText(3)).toBe("★★★");
  });
  it("words the boards", () => {
    expect(boardsText(1)).toBe("1 board");
    expect(boardsText(3)).toBe("3 boards");
  });
});
