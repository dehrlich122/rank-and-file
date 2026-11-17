# expect: error GameArgumentError
pawn.move()
cycle = int(pawn.read().split(" ")[5])
ahead = pawn.squares_ahead()
pawn.wait(cycle - ahead - 1)
pawn.move(ahead + 2)
