import { describe, expect, it } from "vitest";
import { memoryStorage } from "../storage.fake";
import { remixOf, SharedStore } from "./shared";

const level = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  title,
  brief: "Get there.",
  map: ". G\nP .",
  api: ["move"],
  ...extra,
});

describe("Shared with me", () => {
  it("keeps each level by its id, the one opened last first, and survives a reload", () => {
    let clock = 1;
    const storage = memoryStorage();
    const store = new SharedStore(storage, () => clock++);
    store.keep(level("shared-aaa", "First"));
    store.keep(level("shared-bbb", "Second", { variants: [{ map: "G .\nP ." }] }));
    store.keep(level("shared-aaa", "First")); // opened again: one entry, now on top
    const again = new SharedStore(storage);
    expect(again.list().map((s) => [s.id, s.title, s.boards])).toEqual([
      ["shared-aaa", "First", 1],
      ["shared-bbb", "Second", 2],
    ]);
    expect(again.get("shared-bbb")?.title).toBe("Second");
    again.remove("shared-aaa");
    expect(new SharedStore(storage).list().map((s) => s.id)).toEqual(["shared-bbb"]);
  });

  it("skips damaged entries", () => {
    const storage = memoryStorage({ "rank-and-file:shared": JSON.stringify({ levels: { a: { data: 3, opened: 1 }, b: "x" } }) });
    expect(new SharedStore(storage).list()).toEqual([]);
  });
});

describe("remixing a shared level", () => {
  it("makes a draft of your own: a new id, (remix) in the title, and never the author's solution", () => {
    const draft = remixOf(level("shared-aaa", "The Long Corridor", { solution: "secret" }), "my-remix");
    expect(draft.id).toBe("my-remix");
    expect(draft.title).toBe("The Long Corridor (remix)");
    expect("solution" in draft.extra).toBe(false);
  });

  it("keeps the title within the engine's limit", () => {
    expect(remixOf(level("shared-aaa", "x".repeat(60)), "my-remix").title.length).toBe(60);
  });
});
