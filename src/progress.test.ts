import { describe, expect, it } from "vitest";
import { ProgressStore, sanitize } from "./progress";
import { memoryStorage } from "./storage.fake";

describe("ProgressStore", () => {
  it("starts with every level untouched", () => {
    expect(new ProgressStore(memoryStorage()).level("ch01-l01")).toEqual({ stars: 0, hints: 0, failedRuns: 0, helped: false, solutionSeen: false, code: null });
  });

  it("saves solved levels and code, and reads them back in a new session", () => {
    const storage = memoryStorage();
    const store = new ProgressStore(storage);
    store.update("ch01-l01", { stars: 2, hints: 1 });
    store.update("ch01-l01", { code: "# my notes" });
    store.update("ch01-l02", { code: "" });
    const reloaded = new ProgressStore(storage);
    expect(reloaded.level("ch01-l01")).toEqual({ stars: 2, hints: 1, failedRuns: 0, helped: false, solutionSeen: false, code: "# my notes" });
    expect(reloaded.solved("ch01-l01") && !reloaded.solved("ch01-l02")).toBe(true); // solved means at least one star
    expect(reloaded.level("ch01-l02")).toEqual({ stars: 0, hints: 0, failedRuns: 0, helped: false, solutionSeen: false, code: "" }); // emptied on purpose, not the starter
  });

  it("resets everything", () => {
    const storage = memoryStorage();
    new ProgressStore(storage).update("ch01-l01", { stars: 1, code: "x = 1" });
    const store = new ProgressStore(storage);
    store.reset();
    expect(store.level("ch01-l01")).toEqual({ stars: 0, hints: 0, failedRuns: 0, helped: false, solutionSeen: false, code: null });
    expect(new ProgressStore(storage).level("ch01-l01")).toEqual({ stars: 0, hints: 0, failedRuns: 0, helped: false, solutionSeen: false, code: null });
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

  it("offers a solution after three failed runs, whether or not any hint is open (QA-042)", () => {
    const store = new ProgressStore(memoryStorage());
    store.recordFailedRun("a");
    store.recordFailedRun("a");
    expect(store.offersSolution("a")).toBe(false);
    store.recordFailedRun("a");
    expect(store.level("a").hints).toBe(0);
    expect(store.offersSolution("a")).toBe(true);
    store.recordFailedRun("a"); // the count stops once the offer is made
    expect(store.level("a").failedRuns).toBe(3);
  });

  it("stops offering a solution once the level is solved or a solution seen, and counts no more failed runs", () => {
    const store = new ProgressStore(memoryStorage());
    for (const id of ["solved", "helped"]) for (let i = 0; i < 3; i++) store.recordFailedRun(id);
    store.update("solved", { stars: 1 });
    store.update("helped", { helped: true, solutionSeen: true });
    expect(store.offersSolution("solved") || store.offersSolution("helped")).toBe(false);
    store.update("fresh", { stars: 2 });
    store.recordFailedRun("fresh");
    expect(store.level("fresh").failedRuns).toBe(0);
  });

  it("carries over the failed runs saved before QA-042, when they only counted after the hints", () => {
    expect(sanitize({ a: { failedAfterHints: 3 } }).a?.failedRuns).toBe(3);
    expect(sanitize({ a: { failedAfterHints: 3, failedRuns: 1 } }).a?.failedRuns).toBe(1);
    expect(new ProgressStore(memoryStorage({ "rank-and-file:progress": JSON.stringify({ a: { hints: 3, failedAfterHints: 3 } }) })).offersSolution("a")).toBe(true);
  });

  it("ignores corrupted or malformed saved progress", () => {
    expect(new ProgressStore(memoryStorage({ "rank-and-file:progress": "{not json" })).level("a")).toEqual({ stars: 0, hints: 0, failedRuns: 0, helped: false, solutionSeen: false, code: null });
    expect(sanitize([1, 2])).toEqual({});
    expect(sanitize({ a: "yes", b: { solved: "true", stars: "3", code: 3 }, c: { stars: 7 } })).toEqual({
      a: { stars: 0, hints: 0, failedRuns: 0, helped: false, solutionSeen: false, code: null },
      b: { stars: 0, hints: 0, failedRuns: 0, helped: false, solutionSeen: false, code: null },
      c: { stars: 3, hints: 0, failedRuns: 0, helped: false, solutionSeen: false, code: null },
    });
  });
});
