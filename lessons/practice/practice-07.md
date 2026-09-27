# Timed gates

A timed gate rises and falls on its own. Its badge says how: *2 of 3* means open for 2 ticks, then shut for 1, over and over, starting open. It keeps time with you, like a patrol: each square moved, each turn and each wait is a tick.

A shut gate blocks like a wall:

```python run error
pawn.move()
pawn.wait()
pawn.move()
```

An open gate lets you in, but if it shuts while you're under it, you're crushed:

```python run lost
pawn.move(2)
```

Arrive just as it opens, and you're through before it shuts:

```python run
pawn.move()
pawn.wait()
pawn.wait()
pawn.move(2)
```
