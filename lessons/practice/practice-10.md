# Pits and chasers

A chaser follows its rule without looking where it steps. A wall stops it, and it tries another way. A pit doesn't stop it: if its step lands on a pit, it falls in and is gone for good.

So pits can work for you. Stand where the chaser's next step, along the bigger gap, takes it into a pit.

Standing still is a move too. `pawn.wait()` lets the chaser take a step while you stay put:

```python run
pawn.wait()
pawn.move()
print("The chaser took two steps")
```
