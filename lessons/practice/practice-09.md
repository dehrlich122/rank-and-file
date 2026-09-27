# Capturing

Pawns capture on the diagonal, as in chess. `pawn.capture_left()` takes the enemy one square diagonally forward and to the left, and your pawn moves onto its square. `pawn.capture_right()` does the same to the right. A capture is a move, so it's a tick.

Some enemies are **armoured**, marked with a shield: they can't be taken.

Capturing where there's no enemy is an error, like bumping into a wall. This practice board is empty:

```python run error
pawn.capture_left()
```
