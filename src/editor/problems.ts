// What the engine said was wrong with a draft, placed on the board (M4.2). The engine says where in its own
// terms (`ProblemAt`: a square or several, an enemy's number, a field).
import type { Pos, ProblemAt } from "../py/protocol";
import { parseSquare } from "./draft";

export interface Problem {
  message: string;
  squares: Pos[]; // squares to mark
  enemy: number | null; // an enemy to mark: its place in the draft's list, from 0
  field: string | null; // a field of the level: "title", "goal", "start", "api", "size", ...
}

export function placeProblem(message: string, at: ProblemAt | null | undefined): Problem {
  const names = [...(at?.square ? [at.square] : []), ...(at?.squares ?? [])];
  const squares = names.map(parseSquare).filter((pos): pos is Pos => pos !== null);
  return { message, squares, enemy: at?.enemy !== undefined ? at.enemy - 1 : null, field: at?.field ?? null };
}
