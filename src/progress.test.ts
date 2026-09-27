import { describe, expect, it } from "vitest";
import { ProgressStore, sanitize } from "./progress";
import { memoryStorage } from "./storage.fake";

describe("ProgressStore", () => {
  it("starts with every level untouched", () => {
    expect(new ProgressStore(memoryStorage()).level("ch01-l01")).toEqual({ stars: 0, hints: 0, failedAfterHints: 0, helped: false, solutionSeen: false, code: null });
  });

  it("saves solved levels and code, and reads them back in a new session", () => {
    const storage = memoryStorage();
    const store = new ProgressStore(storage);
    store.update("ch01-l01", { stars: 2, hints: 1 });
    store.update("ch01-l01", { code: "# my notes" });
    store.update("ch01-l02", { code: "" });
    const reloaded = new ProgressStore(storage);
    expect(reloaded.level("ch01-l01")).toEqual({ stars: 2, hints: 1, failedAfterHints: 0, helped: false, solutionSeen: false, code: "# my notes" });
    expect(reloaded.solved("ch01-l01") && !reloaded.solved("ch01-l02")).toBe(true); // solved means at least one star
    expect(reloaded.level("ch01-l02")).toEqual({ stars: 0, hints: 0, failedAfterHints: 0, helped: false, solutionSeen: false, code: "" }); // emptied on purpose, not the starter
  });

  it("resets everything", () => {
    const storage = memoryStorage();
    new ProgressStore(storage).update("ch01-l01", { stars: 1, code: "x = 1" });
    const store = new ProgressStore(storage);
    store.reset();
    expect(store.level("ch01-l01")).toEqual({ stars: 0, hints: 0, failedAfterHints: 0, helped: false, solutionSeen: false, code: null });
    expect(new ProgressStore(storage).level("ch01-l01")).toEqual({ stars: 0, hints: 0, failedAfterHints: 0, helped: false, solutionSeen: false, code: null });
  });

  it("works without storage", () => {
    const store = new ProgressStore(null);
    store.update("ch01-l01", { stars: 1 });
    expect(store.solved("ch01-l01")).toBe(true);
  });

  it("remembers a seen solution; progress saved before QA-018 counts 'Show me a solution' as seen", () => {
    const storage = memoryStorage();
    new ProgressStore(storage).update("ch01-l01", { solutionSeen: true });
    expect(new ProgressStore(storage).level("ch01-l01").solutionSeen).toBe(true);
    expect(sanitize({ a: { helped: true } }).a?.solutionSeen).toBe(true);
  });

  it("ignores corrupted or malformed saved progress", () => {
    expect(new ProgressStore(memoryStorage({ "rank-and-file:progress": "{not json" })).level("a")).toEqual({ stars: 0, hints: 0, failedAfterHints: 0, helped: false, solutionSeen: false, code: null });
    expect(sanitize([1, 2])).toEqual({});
    expect(sanitize({ a: "yes", b: { solved: "true", stars: "3", code: 3 }, c: { stars: 7 } })).toEqual({
      a: { stars: 0, hints: 0, failedAfterHints: 0, helped: false, solutionSeen: false, code: null },
      b: { stars: 0, hints: 0, failedAfterHints: 0, helped: false, solutionSeen: false, code: null },
      c: { stars: 3, hints: 0, failedAfterHints: 0, helped: false, solutionSeen: false, code: null },
    });
  });
});
