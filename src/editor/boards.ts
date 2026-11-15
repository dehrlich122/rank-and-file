// A level's other boards (M4.3). A level can run on several boards that one program must solve (`variants` in the
// level file). The draft keeps its first board in the fields it always had, and the others in `boards`; to edit board
// *i* the editor works on a *view*: a draft whose own board fields are board *i*'s. Every editing function, the board
// and `draftToLevelInfo` work on that view, unchanged, and `commitBoard` puts an edited view back.
//
// Level-wide things (title, brief, abilities, facing, planks, the rules) are the same in every view; a board's own are
// its size, tiles, texts, start, goal and enemies. Hidden-goal squares (`?`) belong to the first board only.
import type { Draft, DraftBoard } from "./draft";

const pick = ({ width, height, cells, start, goal, enemies }: DraftBoard): DraftBoard => ({ width, height, cells, start, goal, enemies });

export type BoardEdit = { draft: Draft; index: number; note: string } | { refused: string };

/** How many boards the level has, the first included. */
export const boardCount = (draft: Draft): number => 1 + draft.boards.length;

/** "Board 1", "Board 2"... */
export const boardName = (index: number): string => `Board ${index + 1}`;

/** The draft as board `index` (from 0) is edited: the same draft for the first board, another view for the rest. */
export function viewOf(draft: Draft, index: number): Draft {
  const board = index > 0 ? draft.boards[index - 1] : undefined;
  return board ? { ...draft, ...pick(board), spots: [] } : draft;
}

/** The whole draft, once `edited` (a view of board `index`) has been changed: level-wide changes are kept, and the board's own go to the board. */
export function commitBoard(draft: Draft, index: number, edited: Draft): Draft {
  if (index === 0 || !draft.boards[index - 1]) return edited;
  return { ...edited, ...pick(draft), spots: draft.spots, boards: draft.boards.map((board, i) => (i === index - 1 ? pick(edited) : board)) };
}

/** A new board after the others, starting as a copy of board `from` (so the author edits only what differs). */
export function addBoard(draft: Draft, from: number, most: number): BoardEdit {
  if (boardCount(draft) >= most) return { refused: `A level can have at most ${most} boards.` };
  const copy: DraftBoard = pick(viewOf(draft, from));
  return { draft: { ...draft, boards: [...draft.boards, copy] }, index: draft.boards.length + 1, note: `Added ${boardName(draft.boards.length + 1)}, a copy of ${boardName(from)}.` };
}

/** The level without board `index`. Removing the first board makes the second the first (it has no hidden-goal squares to lose). */
export function removeBoard(draft: Draft, index: number): BoardEdit {
  if (!draft.boards.length) return { refused: "A level needs at least one board." };
  const note = `Removed ${boardName(index)}.`;
  if (index > 0) return { draft: { ...draft, boards: draft.boards.filter((_, i) => i !== index - 1) }, index: index - 1, note };
  const [next, ...rest] = draft.boards;
  return { draft: { ...draft, ...pick(next!), spots: [], boards: rest }, index: 0, note };
}

/** The board's own fields, as the file's `variants` entry has them. */
export const boardOf = pick;
