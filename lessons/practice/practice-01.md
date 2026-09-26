# Hidden boards

Some levels test your code on **hidden boards** as well as the one you can see: the same kind of place, a little different each time. Code that only fits the visible board won't pass.

Your pawn can now ask whether it's standing on the goal. This little practice board has no goal, so the answer is `False`:

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
