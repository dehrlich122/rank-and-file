// The player's progress, level by level: its best stars (any solve earns at
// least one), the hints opened, whether its solution was seen (and whether
// that was before solving it), and the code written for it. Saved in localStorage (see storage.ts), so it survives
// reloads. Settings → Reset progress clears it.
import { asRecord, browserStorage, readJson, writeJson, type StorageLike } from "./storage";

export interface LevelProgress {
  stars: number; // the best a solving run has earned, 0 to 3; more than 0 means solved
  hints: number; // how many hint tiers are open
  failedAfterHints: number; // runs that failed after every hint was open (3 unlock "Show me a solution")
  helped: boolean; // saw a solution before solving it ("Show me a solution")
  solutionSeen: boolean; // saw the idiomatic solution, before or after solving: no third star from then on (QA-018)
  code: string | null; // the editor's contents; null means the level's starter code
}

const STORAGE_KEY = "rank-and-file:progress";
// What the player has been shown once (M3.7): promotion ceremonies by tier, chapter crowns by chapter number.
const SEEN_KEY = "rank-and-file:seen";
const UNTOUCHED: LevelProgress = { stars: 0, hints: 0, failedAfterHints: 0, helped: false, solutionSeen: false, code: null };

export class ProgressStore {
  private levels: Record<string, LevelProgress>;
  private seen: { promotions: string[]; crowns: number[] };

  constructor(private readonly storage: StorageLike | null = browserStorage()) {
    this.levels = sanitize(readJson(storage, STORAGE_KEY));
    this.seen = sanitizeSeen(readJson(storage, SEEN_KEY));
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

  /** Whether the player has already been shown `tier`'s promotion ceremony, or `chapter`'s crown. */
  hasSeen(kind: "promotion" | "crown", key: string | number): boolean {
    return kind === "promotion" ? this.seen.promotions.includes(String(key)) : this.seen.crowns.includes(Number(key));
  }

  markSeen(kind: "promotion" | "crown", key: string | number): void {
    if (this.hasSeen(kind, key)) return;
    this.seen = kind === "promotion" ? { ...this.seen, promotions: [...this.seen.promotions, String(key)] } : { ...this.seen, crowns: [...this.seen.crowns, Number(key)] };
    writeJson(this.storage, SEEN_KEY, this.seen);
  }

  reset(): void {
    this.levels = {};
    this.seen = { promotions: [], crowns: [] };
    writeJson(this.storage, STORAGE_KEY, this.levels);
    writeJson(this.storage, SEEN_KEY, this.seen);
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
      solutionSeen: entry.solutionSeen === true || entry.helped === true,
      code: typeof entry.code === "string" ? entry.code : null,
    };
  }
  return levels;
}

/** Keep only well-formed entries of what has been shown once. */
function sanitizeSeen(raw: unknown): { promotions: string[]; crowns: number[] } {
  const input = asRecord(raw);
  const list = <T>(value: unknown, ok: (item: unknown) => item is T): T[] => (Array.isArray(value) ? value.filter(ok) : []);
  return {
    promotions: list(input.promotions, (item): item is string => typeof item === "string"),
    crowns: list(input.crowns, (item): item is number => typeof item === "number"),
  };
}

/** A whole number from 0 to `max`; anything else is 0. */
function count(value: unknown, max: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(0, Math.round(value))) : 0;
}

/** The app-wide progress. */
export const progress = new ProgressStore();
