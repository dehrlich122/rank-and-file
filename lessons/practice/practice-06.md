# Clockwork and loops

A patrol with a gear badge is **clockwork**. It doesn't keep time with your pawn: your code winds it up. It takes one step each time a line of your code runs for the first time. A line that runs again doesn't wind it.

A `for` loop runs the lines indented under it again and again. `range(3)` counts 0, 1, 2, so the indented line runs three times, but it's new only the first time. Watch the patrol: two new lines, two steps.

```python run
for step in range(3):
    print("This line runs again:", step)
```

The same three prints, copied out, are three new lines, and three steps:

```python run
print("One")
print("Two")
print("Three")
```
