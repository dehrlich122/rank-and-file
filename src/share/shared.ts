// "Shared with me" (M4.3): every shared level the player has opened, kept in this browser by its content id
// (`shared-<hash>`, see codec.ts), so a link opened twice is one entry. Each is kept as the level file's data, the
// author's solution included, which is only ever shown as text after three failed runs, never run. Its progress lives
// in a store of its own (`sharedProgress`), apart from the curriculum's: Settings → Reset progress clears that, never
// this list.
import { newId, type Draft } from "../editor/draft";
import { levelDataToDraft } from "../editor/levelData";
import { ProgressStore } from "../progress";
import { asRecord, browserStorage, readJson, writeJson, type StorageLike } from "../storage";

const STORAGE_KEY = "rank-and-file:shared";
const PROGRESS_KEY = "rank-and-file:shared-progress";
const TITLE_LIMIT = 60; // the engine's LIMITS["title"]

export interface SharedSummary {
  id: string;
  title: string;
  boards: number; // the level's own board and its other boards
  opened: number; // when it was last opened, in ms since 1970
}

interface Kept {
  data: Record<string, unknown>;
  opened: number;
}

export class SharedStore {
  private kept: Record<string, Kept>;

  constructor(
    private readonly storage: StorageLike | null = browserStorage(),
    private readonly now: () => number = Date.now,
  ) {
    this.kept = {};
    for (const [id, entry] of Object.entries(asRecord(asRecord(readJson(storage, STORAGE_KEY)).levels))) {
      const { data, opened } = asRecord(entry);
      if (typeof opened === "number" && data && typeof data === "object" && !Array.isArray(data)) this.kept[id] = { data: data as Record<string, unknown>, opened };
    }
  }

  /** Every kept level, the one opened last first. */
  list(): SharedSummary[] {
    return Object.entries(this.kept)
      .map(([id, { data, opened }]) => ({
        id,
        title: typeof data.title === "string" ? data.title : "Untitled",
        boards: 1 + (Array.isArray(data.variants) ? data.variants.length : 0),
        opened,
      }))
      .sort((a, b) => b.opened - a.opened);
  }

  /** A kept level's data, as it arrived (its id already rewritten), or null. */
  get(id: string): Record<string, unknown> | null {
    return this.kept[id]?.data ?? null;
  }

  /** Keep a level the engine has accepted. Its `id` must already be its content id; opening it again moves it to the top. */
  keep(data: Record<string, unknown>): void {
    const id = String(data.id);
    this.save({ ...this.kept, [id]: { data, opened: this.now() } });
  }

  remove(id: string): void {
    const { [id]: _gone, ...rest } = this.kept;
    this.save(rest);
  }

  private save(next: Record<string, Kept>): void {
    this.kept = next;
    writeJson(this.storage, STORAGE_KEY, { levels: next });
  }
}

/**
 * A shared level as a new draft of the player's own: a new id, "(remix)" after the title, and **without the author's
 * solution** (a changed level needs its own proof, and a stranger's code is never run here).
 */
export function remixOf(data: Record<string, unknown>, id = newId()): Draft {
  const draft = levelDataToDraft(data, { id });
  const { solution: _dropped, ...extra } = draft.extra;
  const suffix = " (remix)";
  return { ...draft, title: `${draft.title.slice(0, TITLE_LIMIT - suffix.length)}${suffix}`, extra };
}

/** The player's kept shared levels. */
export const sharedLevels = new SharedStore();

/** Stars, hints, failed runs and code on shared levels, apart from the curriculum's progress. */
export const sharedProgress = new ProgressStore(browserStorage(), PROGRESS_KEY);
