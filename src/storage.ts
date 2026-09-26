// Saving small JSON records in localStorage, for settings and progress.
//
// The browser may refuse storage (private mode, blocked site data). Then reads
// come back empty and writes are dropped, so the game still works and changes
// last until the tab is closed.

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readJson(storage: StorageLike | null, key: string): unknown {
  try {
    const text = storage?.getItem(key);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

export function writeJson(storage: StorageLike | null, key: string, value: unknown): void {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked: keep the value for this session anyway
  }
}

export function browserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null; // some browsers throw just for touching localStorage when it's blocked
  }
}

/** Treat anything that isn't a plain object as an empty one. */
export function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}
