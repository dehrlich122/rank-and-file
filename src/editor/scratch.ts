// The Sandbox's scratch level (QA-061): one level of the player's own, never listed, named or published. It is a
// draft like any other, opened in the editor (#/free/sandbox/board) and on the level screen (#/free/sandbox), and kept
// in this browser under the Sandbox's own key, apart from My levels, with the code typed against it. Reset progress
// leaves it alone, as it leaves My levels; "Start over" in the editor is its own reset.
import { asRecord, browserStorage, readJson, writeJson, type StorageLike } from "../storage";
import { blankDraft, type Draft } from "./draft";
import { draftToLevelData, levelDataToDraft } from "./levelData";
import { setStarter } from "./rules";

const STORAGE_KEY = "rank-and-file:sandbox";
const SCRATCH_ID = "sandbox";
const STARTER = "# Try anything: change the board to make it yours.\npawn.move()\n";
/** The Challenge tab's line on what the Sandbox is: the scratch level's brief, which the player never edits. */
const BRIEF = "A board of your own to try code on. Change the board to paint it, move the goal or pick the abilities.";
/** What a level file can have that the scratch level never does: it has no hints, kept solution or difficulty. */
const NOT_KEPT = ["hints", "solution", "difficulty"];

/** The draft as the scratch level: its own id, name and line, and nothing that is about publishing a level. */
function asScratch(draft: Draft): Draft {
  const extra = { ...draft.extra };
  for (const key of NOT_KEPT) delete extra[key];
  return { ...draft, id: SCRATCH_ID, title: "Sandbox", brief: BRIEF, trains: "", extra };
}

/** What a fresh browser starts with: an open 8 × 8, the piece bottom-left facing north, the goal top-right, every ability. */
export function scratchStart(abilities: string[]): Draft {
  return asScratch(setStarter({ ...blankDraft(8, 8, SCRATCH_ID), api: [...abilities] }, STARTER));
}

export class ScratchStore {
  constructor(private readonly storage: StorageLike | null = browserStorage()) {}

  private read(): { level?: unknown; code?: unknown } {
    return asRecord(readJson(this.storage, STORAGE_KEY)); // the old Sandbox's string, or anything damaged, reads as nothing saved
  }

  /** The scratch level as it was left, or the starting one with `abilities` (the editor's, for the piece) when none is kept. */
  load(abilities: string[]): Draft {
    const { level } = this.read();
    try {
      if (level && typeof level === "object") return asScratch(levelDataToDraft(level, { id: SCRATCH_ID }));
    } catch {
      // damaged: start again
    }
    return scratchStart(abilities);
  }

  save(draft: Draft): void {
    writeJson(this.storage, STORAGE_KEY, { ...this.read(), level: draftToLevelData(asScratch(draft)) });
  }

  /** The code typed against the scratch level, or undefined when none is kept (the level's starter code then). */
  code(): string | undefined {
    const { code } = this.read();
    return typeof code === "string" ? code : undefined;
  }

  setCode(code: string): void {
    writeJson(this.storage, STORAGE_KEY, { ...this.read(), code });
  }

  /** Start over: the starting level (returned, for the editor to show and save), and the starting code again. */
  startOver(abilities: string[]): Draft {
    writeJson(this.storage, STORAGE_KEY, {});
    return scratchStart(abilities);
  }
}

export const scratch = new ScratchStore();
