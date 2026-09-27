# Capturing

Pawns capture on the diagonal, as in chess. `pawn.capture_left()` takes the enemy one square diagonally forward and to the left, and your pawn moves onto its square. `pawn.capture_right()` does the same to the right. A capture is a move, so it's a tick.

```python run
pawn.capture_left()
```

Some enemies are **armoured**, and their badge says so: they can't be taken. Trying is an error, and so is capturing where there's no enemy:

```python run error
pawn.capture_right()
```
