# Pits and planks

A pit is a hole in the board. Step into one and the run is **lost**: the program stops, and your pawn is stuck at the bottom. A long move is still one square at a time, so `pawn.move(3)` falls into a pit on any square it crosses.

A wall can only be walked around. A pit can also be **bridged**. Walk over a plank to pick it up, then face the pit and lay it:

```python run error
pawn.bridge()
```

This practice board has no pit ahead of the pawn, so there's nothing to bridge. On the level, a bridged pit is ordinary floor, safe to cross.
