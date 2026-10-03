// How a step's events are played on the board (M3.7).
import type { GameEvent } from "../py/protocol";

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
