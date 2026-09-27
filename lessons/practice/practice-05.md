# Chasers

A chaser, marked *chases*, steps one square toward your pawn after every tick.

It follows one simple rule. It steps along the rank or the file, whichever gap to your pawn is bigger (east or west when they're equal). If that square is blocked, it tries the other way. If both are blocked, it waits.

This chaser is straight ahead of your pawn, with a wall in its way. Turning on the spot is two ticks, and it gets no closer:

```python run
pawn.turn_left()
pawn.turn_right()
```

Step aside, and the rule finds it a way round:

```python run
pawn.turn_right()
pawn.move(2)
```

A rule you can follow by hand is a rule you can plan around.
