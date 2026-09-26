// The player's progress, level by level: whether it's solved, and the code
// they wrote for it. Saved in localStorage (see storage.ts), so it survives
// reloads. Settings → Reset progress clears it.
import { asRecord, browserStorage, readJson, writeJson, type StorageLike } from "./storage";

export interface LevelProgress {
  solved: boolean; // solved by running code
  code: string | null; // the editor's contents; null means the level's starter code
}

const STORAGE_KEY = "rank-and-file:progress";
const UNTOUCHED: LevelProgress = { solved: false, code: null };

export class ProgressStore {
  private levels: Record<string, LevelProgress>;

  constructor(private readonly storage: StorageLike | null = browserStorage()) {
    this.levels = sanitize(readJson(storage, STORAGE_KEY));
  }

  level(id: string): LevelProgress {
    return this.levels[id] ?? UNTOUCHED;
  }

  update(id: string, changes: Partial<LevelProgress>): void {
    this.levels = { ...this.levels, [id]: { ...this.level(id), ...changes } };
    writeJson(this.storage, STORAGE_KEY, this.levels);
  }

  reset(): void {
    this.levels = {};
    writeJson(this.storage, STORAGE_KEY, this.levels);
  }
}

/** Keep only well-formed entries; anything else reads as untouched. */
export function sanitize(raw: unknown): Record<string, LevelProgress> {
  const levels: Record<string, LevelProgress> = {};
  for (const [id, value] of Object.entries(asRecord(raw))) {
    const entry = asRecord(value);
    levels[id] = { solved: entry.solved === true, code: typeof entry.code === "string" ? entry.code : null };
  }
  return levels;
}

/** The app-wide progress. */
export const progress = new ProgressStore();
