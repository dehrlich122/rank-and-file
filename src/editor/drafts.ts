// "My levels" (M4.2): the levels made in the editor, saved in this browser. They have a key of their own, apart
// from the curriculum's progress, so Settings → Reset progress leaves them alone. Each is kept as a level file's
// data (the same format as `levels/`), and read back through the same code as an import, so a damaged entry is
// skipped instead of breaking the list.
import { asRecord, browserStorage, readJson, writeJson, type StorageLike } from "../storage";
import type { Draft } from "./draft";
import { draftToLevelData, levelDataToDraft } from "./levelData";

const STORAGE_KEY = "rank-and-file:editor";

export interface DraftSummary {
  id: string;
  title: string;
  width: number;
  height: number;
  edited: number; // when it was last saved, in ms since 1970
}

interface Saved {
  data: Record<string, unknown>;
  edited: number;
}

export class DraftStore {
  private saved: Record<string, Saved>;

  constructor(
    private readonly storage: StorageLike | null = browserStorage(),
    private readonly now: () => number = Date.now,
  ) {
    this.saved = {};
    for (const [id, entry] of Object.entries(asRecord(asRecord(readJson(storage, STORAGE_KEY)).levels))) {
      const { data, edited } = asRecord(entry);
      if (typeof edited === "number" && data && typeof data === "object") this.saved[id] = { data: data as Record<string, unknown>, edited };
    }
  }

  /** Every readable level, the one edited last first. */
  list(): DraftSummary[] {
    return Object.entries(this.saved)
      .flatMap(([id, { edited }]) => {
        const draft = this.load(id);
        return draft ? [{ id, title: draft.title, width: draft.width, height: draft.height, edited }] : [];
      })
      .sort((a, b) => b.edited - a.edited);
  }

  load(id: string): Draft | null {
    const entry = this.saved[id];
    if (!entry) return null;
    try {
      return levelDataToDraft(entry.data, { id });
    } catch {
      return null; // damaged: it reads as not there
    }
  }

  save(draft: Draft): void {
    this.keep({ ...this.saved, [draft.id]: { data: draftToLevelData(draft), edited: this.now() } });
  }

  remove(id: string): void {
    const { [id]: _gone, ...rest } = this.saved;
    this.keep(rest);
  }

  private keep(next: Record<string, Saved>): void {
    this.saved = next;
    writeJson(this.storage, STORAGE_KEY, { levels: next });
  }
}

export const drafts = new DraftStore();
