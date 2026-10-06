// The player's progress, level by level: its best stars (any solve earns at
// least one), the hints opened, the failed runs (three offer a solution), whether
// its solution was seen (and whether that was before solving it), and the code
// written for it. Saved in localStorage (see storage.ts), so it survives
// reloads. Settings → Reset progress clears it.
import { asRecord, browserStorage, readJson, writeJson, type StorageLike } from "./storage";

export interface LevelProgress {
  stars: number; // the best a solving run has earned, 0 to 3; more than 0 means solved
  hints: number; // how many hint tiers are open
  failedRuns: number; // runs that didn't solve it, counted up to GIVE_UP_AFTER (QA-042)
  helped: boolean; // saw a solution before solving it ("Show me a solution")
  solutionSeen: boolean; // saw the idiomatic solution, before or after solving: no third star from then on (QA-018)
  code: string | null; // the editor's contents; null means the level's starter code
}

const STORAGE_KEY = "rank-and-file:progress";
// What the player has been shown once (M3.7): promotion ceremonies by tier, chapter crowns by chapter number.
const SEEN_KEY = "rank-and-file:seen";
const UNTOUCHED: LevelProgress = { stars: 0, hints: 0, failedRuns: 0, helped: false, solutionSeen: false, code: null };

/** Failed runs of a level before "Show me a solution" is offered, whether or not any hint is open (QA-042). */
export const GIVE_UP_AFTER = 3;

export class ProgressStore {
  private levels: Record<string, LevelProgress>;
  private seen: string[]; // "promotion:pawn", "crown:3"

  constructor(private readonly storage: StorageLike | null = browserStorage()) {
    this.levels = sanitize(readJson(storage, STORAGE_KEY));
    const seen = readJson(storage, SEEN_KEY);
    this.seen = Array.isArray(seen) ? seen.filter((key): key is string => typeof key === "string") : [];
  }

  level(id: string): LevelProgress {
    return this.levels[id] ?? UNTOUCHED;
  }

  /** Solved by running code: every solving run earns at least one star. */
  solved(id: string): boolean {
    return this.level(id).stars > 0;
  }

  /** "Show me a solution" is on offer: GIVE_UP_AFTER runs have failed, hints or not, and it's neither solved nor seen yet. */
  offersSolution(id: string): boolean {
    const { failedRuns, helped } = this.level(id);
    return failedRuns >= GIVE_UP_AFTER && !helped && !this.solved(id);
  }

  /** A run of the level didn't solve it: one more towards the offer, until it's made. */
  recordFailedRun(id: string): void {
    const { failedRuns, helped } = this.level(id);
    if (failedRuns < GIVE_UP_AFTER && !helped && !this.solved(id)) this.update(id, { failedRuns: failedRuns + 1 });
  }

  update(id: string, changes: Partial<LevelProgress>): void {
    this.levels = { ...this.levels, [id]: { ...this.level(id), ...changes } };
    writeJson(this.storage, STORAGE_KEY, this.levels);
  }

  /** Whether the player has already been shown `tier`'s promotion ceremony, or `chapter`'s crown. */
  hasSeen(kind: "promotion" | "crown", key: string | number): boolean {
    return this.seen.includes(`${kind}:${key}`);
  }

  markSeen(kind: "promotion" | "crown", key: string | number): void {
    if (this.hasSeen(kind, key)) return;
    this.seen = [...this.seen, `${kind}:${key}`];
    writeJson(this.storage, SEEN_KEY, this.seen);
  }

  reset(): void {
    this.levels = {};
    this.seen = [];
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
      failedRuns: count(entry.failedRuns ?? entry.failedAfterHints, 99), // saved before QA-042: the runs failed after the hints
      helped: entry.helped === true,
      solutionSeen: entry.solutionSeen === true || entry.helped === true,
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
