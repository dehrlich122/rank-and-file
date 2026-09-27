# Pits and planks

A pit is a hole in the board. Step into one and the run is **lost**: the program stops, and your pawn is stuck at the bottom. A long move is still one square at a time, so it falls into a pit on any square it crosses:

```python run lost
pawn.move(3)
```

A wall can only be walked around. A pit can also be **bridged**. Walk over a plank to pick it up, then face the pit and lay it with `pawn.bridge()`. A bridged pit is ordinary floor:

```python run
pawn.move()
pawn.bridge()
pawn.move(2)
```
