// The player's progress, level by level: its best stars (any solve earns at
// least one), the hints opened, whether its solution was seen, and the code
// written for it. Saved in localStorage (see storage.ts), so it survives
// reloads. Settings → Reset progress clears it.
import { asRecord, browserStorage, readJson, writeJson, type StorageLike } from "./storage";

export interface LevelProgress {
  stars: number; // the best a solving run has earned, 0 to 3; more than 0 means solved
  hints: number; // how many hint tiers are open
  failedAfterHints: number; // runs that failed after every hint was open (3 unlock "Show me a solution")
  helped: boolean; // saw a solution before solving it
  code: string | null; // the editor's contents; null means the level's starter code
}

const STORAGE_KEY = "rank-and-file:progress";
const UNTOUCHED: LevelProgress = { stars: 0, hints: 0, failedAfterHints: 0, helped: false, code: null };

export class ProgressStore {
  private levels: Record<string, LevelProgress>;

  constructor(private readonly storage: StorageLike | null = browserStorage()) {
    this.levels = sanitize(readJson(storage, STORAGE_KEY));
  }

  level(id: string): LevelProgress {
    return this.levels[id] ?? UNTOUCHED;
  }

  /** Solved by running code: every solving run earns at least one star. */
  solved(id: string): boolean {
    return this.level(id).stars > 0;
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
    levels[id] = {
      stars: count(entry.stars, 3),
      hints: count(entry.hints, 10),
      failedAfterHints: count(entry.failedAfterHints, 99),
      helped: entry.helped === true,
      code: typeof entry.code === "string" ? entry.code : null,
    };
  }
  return levels;
}

/** A whole number from 0 to `max`; anything else is 0. */
function count(value: unknown, max: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(0, Math.round(value))) : 0;
}

/** The app-wide progress. */
export const progress = new ProgressStore();
