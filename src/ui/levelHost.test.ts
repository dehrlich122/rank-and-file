// The level host (M4.4-0): what each way of opening the level screen says. No DOM: the pieces that build elements
// (the banner, Keep) are only checked for being there.
import { describe, expect, it, vi } from "vitest";
import { chapters } from "../content";
import { progress, ProgressStore } from "../progress";
import { sharedProgress } from "../share/shared";
import type { SolutionSource } from "./compare";
import { lessonHost, sharedHost, testPlayHost } from "./levelHost";

const curriculum = chapters.filter((chapter) => chapter.curriculum).flatMap((chapter) => chapter.levels);

const given: SolutionSource = { name: "the author's solution", explained: false, load: async () => null };
const testPlay = (solution: SolutionSource | null = null) => testPlayHost({ back: "#/editor/abc", keep: vi.fn(), kept: () => "", solution });

describe("lessonHost", () => {
  it("is the curriculum's own screen", () => {
    const host = lessonHost();
    expect(host.kind).toBe("lesson");
    expect(host.progress).toBe(progress);
    expect(host.solution).toBeUndefined(); // the reference solution, by id
    expect(host.learn).toBe(true);
    expect(host.curriculum).toBe(true);
    expect(host.frame).toBeUndefined();
    expect(host.back).toBeUndefined();
    expect(host.codes).toBeUndefined();
    expect(host.solvedActions).toBeUndefined();
  });

  it("goes on to the next level, and back to Lessons after the last", () => {
    const [first, second] = curriculum;
    expect(lessonHost().onward(first!.id)).toEqual({ href: `#/level/${second!.id}`, label: "Next level →" });
    expect(lessonHost().onward(curriculum.at(-1)!.id)).toEqual({ href: "#/lessons", label: "Back to Lessons" });
  });

  it("has no next level for a level of no chapter", () => {
    expect(lessonHost().onward("shared-nowhere")).toEqual({ href: "#/lessons", label: "Back to Lessons" });
  });
});

describe("testPlayHost", () => {
  it("is outside the curriculum, with a store of its own that nothing else sees", () => {
    const host = testPlay();
    expect(host.kind).toBe("testPlay");
    expect(host.progress).toBeInstanceOf(ProgressStore);
    expect(host.progress).not.toBe(progress);
    expect(host.progress).not.toBe(sharedProgress);
    expect(testPlay().progress).not.toBe(host.progress); // one per screen
    expect(host.learn).toBe(false);
    expect(host.curriculum).toBe(false);
    expect(host.frame).toBeUndefined();
  });

  it("offers the solution it was given, or none", () => {
    expect(testPlay(given).solution).toBe(given);
    expect(testPlay(null).solution).toBeNull();
  });

  it("links back to the editor, in the toolbar and on a solved card", () => {
    const host = testPlay();
    expect(host.back).toEqual({ href: "#/editor/abc", label: "← Editor" });
    expect(host.onward("any")).toEqual({ href: "#/editor/abc", label: "← Back to the editor" });
    expect(host.solvedActions).toBeTypeOf("function"); // Keep
  });

  it("keeps the code typed, per level", () => {
    const { codes } = testPlay();
    expect(codes).toBeDefined();
    expect(codes!.get("host-test-a")).toBeUndefined();
    codes!.set("host-test-a", "one");
    codes!.set("host-test-b", "two");
    expect(codes!.get("host-test-a")).toBe("one");
    expect(codes!.get("host-test-b")).toBe("two");
    codes!.set("host-test-a", "three");
    expect(codes!.get("host-test-a")).toBe("three");
    expect(codes!.get("host-test-b")).toBe("two");
  });
});

describe("sharedHost", () => {
  it("is played for real, outside the curriculum, in the shared levels' own store", () => {
    const host = sharedHost({ id: "shared-x" });
    expect(host.kind).toBe("shared");
    expect(host.progress).toBe(sharedProgress);
    expect(host.learn).toBe(false);
    expect(host.curriculum).toBe(false);
    expect(host.frame).toBeTypeOf("function"); // the banner
    expect(host.back).toBeUndefined();
    expect(host.codes).toBeUndefined(); // code is saved in the store
    expect(host.solvedActions).toBeUndefined();
  });

  it("offers no solution when the level has none, and the author's when it does", async () => {
    expect(sharedHost({ id: "shared-x" }).solution).toBeNull();
    expect(sharedHost({ id: "shared-x", solution: "   " }).solution).toBeNull();
    const offered = sharedHost({ id: "shared-x", solution: "some code" }).solution;
    expect(offered?.name).toBe("the author's solution");
    expect((await offered!.load())?.code).toBe("some code");
  });

  it("goes back to the list on My levels", () => {
    expect(sharedHost({ id: "shared-x" }).onward("shared-x")).toEqual({ href: "#/editor", label: "← Shared with me" });
  });
});
