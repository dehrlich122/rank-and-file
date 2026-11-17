# The knight's jump

A knight doesn't walk or turn. It jumps in an L: two squares one way and one square the other.

`knight.jump(dx, dy)` takes two numbers. `dx` is how far right and `dy` is how far up. A number below 0 goes the other way: left, or down.

```python run
knight.jump(1, 2)
knight.jump(-2, -1)
```

One of the two numbers has to be 1 or -1, and the other 2 or -2. Anything else isn't an L:

```python run error
knight.jump(2, 2)
```

And a knight never walks, so the pawn's abilities aren't its own:

```python run error
knight.move()
```
