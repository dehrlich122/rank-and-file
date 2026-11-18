// How a step's events are played on the board (M3.7).
import type { Facing, GameEvent, Pos } from "../py/protocol";

/**
 * A pawn walks one square at a time, so `move(3)` is three separate hops. Other pieces will move
 * any number of squares in one go, as in chess, so for them a run of moves the same way is one
 * smooth slide: the last move's state is where the piece ends, and the board slides straight there.
 */
export function playableEvents(events: GameEvent[], piece: string): GameEvent[] {
  if (piece === "pawn") return events;
  return events.filter((event, i) => {
    const next = events[i + 1];
    return !(event.kind === "move" && next?.kind === "move" && next.state.facing === event.state.facing);
  });
}

/** The long leg of a jump takes this share of its time; the short leg takes the rest. */
const LONG_SHARE = 0.6;

/** One leg of a jump: where it ends, the way the knight is drawn facing during it, how long it takes and how it eases. */
interface JumpLeg {
  to: Pos;
  facing: Facing;
  ms: number;
  easing: "ease-in" | "ease-out";
}

export type JumpPlan = [long: JumpLeg, short: JumpLeg];

/** The way a straight run from `a` to `b` heads (rank 1 is at the bottom, so y growing is north); undefined if it isn't straight. */
function heading(a: Pos, b: Pos): Facing | undefined {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  if (dx !== 0 && dy === 0) return dx > 0 ? "east" : "west";
  if (dy !== 0 && dx === 0) return dy > 0 ? "north" : "south";
  return undefined;
}

/**
 * How a jump is played in `ms`: along the long leg to the corner (`via`), easing in, then along the short leg to where
 * it lands, easing out. The long leg is drawn facing the way it goes, the short leg facing the way the engine reports.
 * Nothing for an event that isn't a jump, or has no `from` or `via` (an old recording), or whose first leg isn't straight.
 */
export function jumpPlan(event: GameEvent, ms: number): JumpPlan | undefined {
  const { from, via } = event;
  const facing = event.kind === "jump" && from && via ? heading(from, via) : undefined;
  if (!via || !facing) return undefined;
  return [
    { to: via, facing, ms: ms * LONG_SHARE, easing: "ease-in" },
    { to: event.state.pos, facing: event.state.facing, ms: ms * (1 - LONG_SHARE), easing: "ease-out" },
  ];
}
