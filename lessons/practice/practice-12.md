# Over, and onto

A jump flies over whatever lies in between: walls, pits, enemies. Only the square it lands on matters.

Landing on an enemy takes it. Here the knight jumps over a wall and onto the enemy:

```python run
knight.jump(1, 2)
```

A knight can't land on a wall. The program stops with an error:

```python run error
knight.jump(-1, 2)
```

And landing in a pit loses the run, just as stepping into one does:

```python run lost
knight.jump(2, 1)
```
