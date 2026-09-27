# Timed gates

A timed gate opens and shuts on its own. Its badge says how often: a gate marked *every 3* is open at the start, shut for the next two ticks, then open again, over and over.

It keeps time with you, like a patrol: each square moved, each turn and each wait is a tick. Your pawn can step into the gate only while it's open. A shut one blocks like a wall:

```python run error
pawn.move(2)
```

Count the ticks along your route, and wait if you'd arrive too early:

```python run
pawn.move()
pawn.wait()
pawn.wait()
pawn.move(2)
```
