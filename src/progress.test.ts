import { describe, expect, it } from "vitest";
import { ProgressStore, sanitize } from "./progress";
import type { StorageLike } from "./storage";

function memoryStorage(initial: Record<string, string> = {}): StorageLike {
  const data = { ...initial };
  return { getItem: (key) => data[key] ?? null, setItem: (key, value) => void (data[key] = value) };
}

describe("ProgressStore", () => {
  it("starts with every level untouched", () => {
    expect(new ProgressStore(memoryStorage()).level("ch01-l01")).toEqual({ solved: false, code: null });
  });

  it("saves solved levels and code, and reads them back in a new session", () => {
    const storage = memoryStorage();
    const store = new ProgressStore(storage);
    store.update("ch01-l01", { solved: true });
    store.update("ch01-l01", { code: "# my notes" });
    store.update("ch01-l02", { code: "" });
    const reloaded = new ProgressStore(storage);
    expect(reloaded.level("ch01-l01")).toEqual({ solved: true, code: "# my notes" });
    expect(reloaded.level("ch01-l02")).toEqual({ solved: false, code: "" }); // emptied on purpose, not the starter
  });

  it("resets everything", () => {
    const storage = memoryStorage();
    new ProgressStore(storage).update("ch01-l01", { solved: true, code: "x = 1" });
    const store = new ProgressStore(storage);
    store.reset();
    expect(store.level("ch01-l01")).toEqual({ solved: false, code: null });
    expect(new ProgressStore(storage).level("ch01-l01")).toEqual({ solved: false, code: null });
  });

  it("works without storage", () => {
    const store = new ProgressStore(null);
    store.update("ch01-l01", { solved: true });
    expect(store.level("ch01-l01").solved).toBe(true);
  });

  it("ignores corrupted or malformed saved progress", () => {
    expect(new ProgressStore(memoryStorage({ "rank-and-file:progress": "{not json" })).level("a")).toEqual({ solved: false, code: null });
    expect(sanitize([1, 2])).toEqual({});
    expect(sanitize({ a: "yes", b: { solved: "true", code: 3 } })).toEqual({
      a: { solved: false, code: null },
      b: { solved: false, code: null },
    });
  });
});
