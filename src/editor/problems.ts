// What the engine said was wrong with a draft, placed on the board (M4.2). The engine says where in its own
// terms (`ProblemAt`: a square, an enemy's number, a field, a legend symbol); the editor knows which squares a
// symbol stands for, because it wrote the legend.
import type { Pos, ProblemAt } from "../py/protocol";
import { parseSquare } from "./draft";

export interface Problem {
  message: string;
  squares: Pos[]; // squares to mark
  enemy: number | null; // an enemy to mark: its place in the draft's list, from 0
  field: string | null; // a field of the level: "title", "goal", "start", "api", "size", ...
}

export function placeProblem(message: string, at: ProblemAt | null | undefined, symbolSquares: Record<string, string[]>): Problem {
  const names = [...(at?.square ? [at.square] : []), ...(at?.symbol ? (symbolSquares[at.symbol] ?? []) : [])];
  const squares = names.map(parseSquare).filter((pos): pos is Pos => pos !== null);
  return { message, squares, enemy: at?.enemy !== undefined ? at.enemy - 1 : null, field: at?.field ?? null };
}
