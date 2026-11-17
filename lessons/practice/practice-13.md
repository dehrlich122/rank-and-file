# Look before you jump

`knight.look(dx, dy)` names what is on the square a jump would land on, without jumping. It takes the same two numbers as `knight.jump(dx, dy)` and gives back a word: "wall", "pit", an enemy's kind. An empty square gives None.

```python run
print(knight.look(-1, 2))
print(knight.look(2, 1))
print(knight.look(1, 2))
```

Looking is free, so look first and let the answer choose the jump:

```python run
if knight.look(2, 1) == "pit":
    print("Not that way!")
    knight.jump(1, 2)
```

When a level has several boards, the same code runs on each of them. What it sees differs from board to board, so it has to look.
