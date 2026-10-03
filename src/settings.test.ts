import { describe, expect, it, vi } from "vitest";
import { applyToDocument, DEFAULTS, sanitize, SettingsStore } from "./settings";
import type { StorageLike } from "./storage";
import { memoryStorage } from "./storage.fake";

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

  it("keeps the code panel's position, and rejects unknown ones", () => {
    const storage = memoryStorage();
    new SettingsStore(storage).set({ codePanel: "left" });
    expect(new SettingsStore(storage).get().codePanel).toBe("left");
    expect(sanitize({ codePanel: "top" }).codePanel).toBe("right");
  });

  it("wraps long lines by default; off is kept, and anything but a boolean is rejected", () => {
    const storage = memoryStorage();
    new SettingsStore(storage).set({ wrapLines: false });
    expect(new SettingsStore(storage).get().wrapLines).toBe(false);
    expect(sanitize({ wrapLines: "false" }).wrapLines).toBe(true);
  });

  it("puts the layout, theme and animation choices on the page as data attributes", () => {
    const root = { dataset: {} as Record<string, string>, style: { setProperty: () => {} } };
    applyToDocument({ ...DEFAULTS, codePanel: "bottom", theme: "light" }, root as unknown as HTMLElement);
    expect(root.dataset).toEqual({ codePanel: "bottom", theme: "light" });
    applyToDocument({ ...DEFAULTS, theme: "system" }, root as unknown as HTMLElement);
    expect(root.dataset).toEqual({}); // following the system leaves no attributes behind
    applyToDocument(DEFAULTS, root as unknown as HTMLElement);
    expect(root.dataset).toEqual({ theme: "dark" }); // dark is the default theme (M3.7)
  });

  it("ignores corrupted or unknown saved values", () => {
    const storage = memoryStorage({ "rank-and-file:settings": '{"speed": 3, "theme": "purple", "motion": "full"' });
    expect(new SettingsStore(storage).get()).toEqual(DEFAULTS); // not valid JSON
    expect(sanitize({ speed: 3, theme: "purple", motion: "full", extra: 1 })).toEqual({ ...DEFAULTS, motion: "full" });
  });
});
