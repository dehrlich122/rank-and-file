// What the board says to a screen reader, as a pure function so a test can pin it.
import type { LevelInfo, WorldState } from "../py/protocol";
import { squareName } from "../editor/draft";

/** "b3", "b3 and c2", "b3, c2 and d5". */
function nameList(names: string[]): string {
  if (names.length < 2) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Its size, where the piece and the goal are, the squares a knight could land on, and a lost run. */
export function describeBoard(
  level: Pick<LevelInfo, "width" | "height" | "goal" | "piece">,
  state: Pick<WorldState, "pos" | "facing" | "landings"> & Partial<Pick<WorldState, "lost">>,
): string {
  const { width, height, goal, piece } = level;
  const parts = [`${width} by ${height} board`, `Your ${piece} is on ${squareName(state.pos)}, facing ${state.facing}`];
  if (state.landings?.length) parts.push(`It can land on ${nameList(state.landings.map(squareName))}`);
  if (goal) parts.push(`The goal is on ${squareName(goal)}`);
  if (state.lost) parts.push(`The run was lost on ${squareName(state.lost)}`);
  return `${parts.join(". ")}.`;
}
