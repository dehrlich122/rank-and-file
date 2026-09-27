The reference solution uses 9 lines of code.

Crossing a waypoint happens in the middle of a move, so one long `pawn.move()` can cross a waypoint and keep going. The fewer turns the route has, the fewer lines it needs.
