# Chasers

A chaser, marked *chases*, steps one square toward your pawn after every tick.

It follows one simple rule. It steps along the rank or the file, whichever gap to your pawn is bigger (east or west when they're equal). If that square is blocked, it tries the other way. If both are blocked, it waits.

A rule you can follow by hand is a rule you can plan around. Walls can't stop a chaser for long, but they can hold one in place.

```python run
pawn.turn_right()
pawn.move(2)
print(pawn)
```
