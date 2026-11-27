// What the board says to a screen reader, as a pure function so a test can pin it.
import type { LevelInfo, Pos, WorldState } from "../py/protocol";
import { squareName } from "../editor/draft";
import { keyWords, openDoors } from "./keyDoor";

/** "b3", "b3 and c2", "b3, c2 and d5". */
function nameList(names: string[]): string {
  if (names.length < 2) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

type BoardLevel = Pick<LevelInfo, "width" | "height" | "goal" | "piece"> & Partial<Pick<LevelInfo, "tiles" | "keys" | "doors">>;
type BoardState = Pick<WorldState, "pos" | "facing" | "landings"> & Partial<Pick<WorldState, "lost" | "collected" | "opened" | "inventory">>;

const has = (list: Pos[] | undefined, pos: Pos) => !!list?.some((p) => p[0] === pos[0] && p[1] === pos[1]);

/** The keys still to pick up, the doors locked or open, and the guard's gates shut or open: one sentence each, as the state has them. */
function obstacleSentences(level: BoardLevel, state: BoardState): string[] {
  const sentences: string[] = [];
  const left = (level.keys ?? []).filter((key) => !has(state.collected, key.pos));
  if (left.length) sentences.push(`To pick up: ${nameList(left.map((key) => `${keyWords(key.name)} on ${squareName(key.pos)}`))}`);
  const open = openDoors(level.doors, state.inventory);
  for (const door of level.doors ?? []) {
    const square = squareName(door.pos);
    sentences.push(has(open, door.pos) ? `The door on ${square} is open` : `The door on ${square} is locked: it wants ${keyWords(door.key)}`);
  }
  (level.tiles ?? []).forEach((row, y) =>
    row.forEach((kind, x) => {
      if (kind === "gate") sentences.push(`The guard's gate on ${squareName([x, y])} is ${has(state.opened, [x, y]) ? "open" : "shut"}`);
    }),
  );
  return sentences;
}

/** Its size, where the piece and the goal are, the squares a knight could land on, the keys, doors and gates, and a lost run. */
export function describeBoard(level: BoardLevel, state: BoardState): string {
  const { width, height, goal, piece } = level;
  const parts = [`${width} by ${height} board`, `Your ${piece} is on ${squareName(state.pos)}, facing ${state.facing}`];
  if (state.landings?.length) parts.push(`It can land on ${nameList(state.landings.map(squareName))}`);
  parts.push(...obstacleSentences(level, state));
  if (goal) parts.push(`The goal is on ${squareName(goal)}`);
  if (state.lost) parts.push(`The run was lost on ${squareName(state.lost)}`);
  return `${parts.join(". ")}.`;
}
