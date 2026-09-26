# A hidden goal

Sometimes you can't see the goal. It's hidden on one of the squares marked **?**, and your code runs once for each of them. It has to reach the goal every time.

Your pawn can ask whether it's standing on the goal. This little practice board has no goal, so the answer is `False`:

```python run
print(pawn.at_goal())
```

A `while` loop repeats its indented lines for as long as its condition is true, checking it again before every round:

```python run
steps = 0
while steps < 3:
    pawn.move()
    steps = steps + 1
print("Stopped after", steps, "steps")
```
