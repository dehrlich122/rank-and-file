// Where a new level can start from (M4.2): a lesson level's board and rules, as a draft, and a draft as a level
// the real level screen can play (test-play).
import type { LevelSource } from "../content";
import { newId, type Draft } from "./draft";
import { draftToLevelData, levelDataToDraft } from "./levelData";

/** What a copy leaves behind: the lesson's words, hints and starter code, and what marks a level as part of the curriculum. */
const LEFT_BEHIND = ["hints", "starter", "lesson", "lesson_board", "mastery", "chapter"];

/** A lesson level's board and rules as a new draft of the player's own. Its hints, starter code, lesson and reference are never copied. */
export function copyOfLevel(data: unknown, id = newId()): Draft {
  const draft = levelDataToDraft(data, { id });
  const extra = { ...draft.extra };
  for (const key of LEFT_BEHIND) delete extra[key];
  return { ...draft, title: `${draft.title} (copy)`, extra };
}

/** A draft as a level the level screen can open: it belongs to no chapter and has no lesson. */
export function testPlaySource(draft: Draft): LevelSource {
  return { id: draft.id, chapter: 0, title: draft.title, trains: draft.trains, mastery: false, lesson: "", data: draftToLevelData(draft).data };
}
