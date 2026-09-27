# Pits

A pit is a hole in the board. Step into one and the run is **lost**: the program stops there, and your pawn is stuck at the bottom.

That's different from bumping into a wall. A bump is a mistake in your code; falling into a pit is losing the game. Both stop the run, so plan your route before you press Run.

A long move is still one square at a time, so `pawn.move(3)` falls into a pit on any of the three squares it crosses.

```python run
pawn.move(2)
pawn.turn_right()
pawn.move()
```
