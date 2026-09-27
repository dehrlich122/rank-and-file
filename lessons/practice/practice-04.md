# Patrols and ticks

A patrol walks its route one square at a time: there and back, or round a loop. Its route is drawn dotted on the board.

It keeps time with you. Each square your pawn moves, each turn and each wait is one **tick**, and after every tick the patrol takes one step. You move, then it moves, as in chess.

If a patrol lands on your square, or you walk into it, your pawn is caught and the run is lost.

`pawn.wait()` spends one tick standing still:

```python run
pawn.wait()
pawn.wait()
pawn.move()
print("Two ticks waiting, one moving")
```
