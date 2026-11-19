import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asFake, fakeDocument } from "./dom.fake";
import { withCode } from "./dom";

describe("withCode", () => {
  beforeEach(() => vi.stubGlobal("document", fakeDocument));
  afterEach(() => vi.unstubAllGlobals());

  /** Plain parts as they are, code parts as `[text]`. */
  const shape = (text: string) => withCode(text).map((p) => (typeof p === "string" ? p : `[${asFake(p).tag}:${asFake(p).text}]`));

  it("returns a text with no backtick as one plain string", () => {
    expect(shape("just words")).toEqual(["just words"]);
  });

  it("turns one span, or two, into code", () => {
    expect(shape("a `b` c")).toEqual(["a ", "[code:b]", " c"]);
    expect(shape("`a` and `b`")).toEqual(["", "[code:a]", " and ", "[code:b]", ""]);
  });

  it("leaves a lone backtick as typed", () => {
    expect(shape("you typed ` here")).toEqual(["you typed ` here"]);
  });

  it("with three backticks, makes one span and leaves the last backtick, and what follows it, plain", () => {
    expect(shape("a `b` c ` d")).toEqual(["a ", "[code:b]", " c ` d"]);
  });
});
