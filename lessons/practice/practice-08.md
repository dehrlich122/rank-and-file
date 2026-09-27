# Gems and a guard's question

Gems are collected by walking over them, like crossing a waypoint.

The guard at this gate doesn't want a passphrase. It asks a question, shown in the Challenge panel, and opens for the right answer. Answer the way you'd say a passphrase: print it while standing next to the gate. `print` shows numbers too, so the answer can be a number.

On this board, the guard asks how many gems you collected. Walk over both, then answer from the square next to the gate:

```python run
pawn.move(3)
print(2)
pawn.move()
```
