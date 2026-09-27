# Clockwork and loops

A patrol with a gear badge is **clockwork**: your code winds it up, not your pawn. It takes one step each time a line of your code runs *for the first time*. A line that runs again doesn't wind it.

A `for` loop repeats the lines indented under it. `range(3)` hands the loop the numbers 0, 1 and 2, one per round. It starts at 0 and stops just before 3, so `range(3)` means three rounds. Each round, `step` holds that round's number:

```python run
for step in range(3):
    print("Round", step)
```

The indented lines can be moves. Your pawn walks three squares, but the loop is only two lines of code, so the patrol takes two steps, then stands still while the loop repeats. Its gear counts its steps:

```python run
for step in range(3):
    pawn.move()
```

The same moves copied out are three new lines, and three steps:

```python run
pawn.move()  # round 0
pawn.move()  # round 1
pawn.move()  # round 2
```
