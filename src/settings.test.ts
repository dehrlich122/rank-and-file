import { describe, expect, it, vi } from "vitest";
import { DEFAULTS, sanitize, SettingsStore, type StorageLike } from "./settings";

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (key) => data[key] ?? null, setItem: (key, value) => void (data[key] = value) };
}

describe("SettingsStore", () => {
  it("starts from the defaults", () => {
    expect(new SettingsStore(memoryStorage()).get()).toEqual(DEFAULTS);
  });

  it("saves changes and reads them back in a new session", () => {
    const storage = memoryStorage();
    new SettingsStore(storage).set({ speed: 2, theme: "dark" });
    expect(new SettingsStore(storage).get()).toEqual({ ...DEFAULTS, speed: 2, theme: "dark" });
  });

  it("tells listeners about changes, but not about non-changes", () => {
    const store = new SettingsStore(memoryStorage());
    const listener = vi.fn();
    const stop = store.subscribe(listener);
    store.set({ speed: 4 });
    store.set({ speed: 4 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ speed: 4 }));
    stop();
    store.set({ speed: 0.5 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("works without storage, and when storage throws", () => {
    const store = new SettingsStore(null);
    store.set({ codeSize: "large" });
    expect(store.get().codeSize).toBe("large");

    const broken: StorageLike = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    const fragile = new SettingsStore(broken);
    expect(fragile.get()).toEqual(DEFAULTS);
    fragile.set({ motion: "reduced" });
    expect(fragile.get().motion).toBe("reduced");
  });

  it("ignores corrupted or unknown saved values", () => {
    const storage = memoryStorage({ "rank-and-file:settings": '{"speed": 3, "theme": "purple", "motion": "full"' });
    expect(new SettingsStore(storage).get()).toEqual(DEFAULTS); // not valid JSON
    expect(sanitize({ speed: 3, theme: "purple", motion: "full", extra: 1 })).toEqual({ ...DEFAULTS, motion: "full" });
  });
});
