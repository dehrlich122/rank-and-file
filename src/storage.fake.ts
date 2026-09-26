// An in-memory stand-in for localStorage, for tests of the saved stores.
import type { StorageLike } from "./storage";

export function memoryStorage(initial: Record<string, string> = {}): StorageLike {
  const data = { ...initial };
  return { getItem: (key) => data[key] ?? null, setItem: (key, value) => void (data[key] = value) };
}
