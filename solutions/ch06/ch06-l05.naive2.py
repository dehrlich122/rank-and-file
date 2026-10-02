# expect: error GameArgumentError
pawn.move()
parts = pawn.read().split(",")
pawn.move(parts[0])
pawn.turn_left()
pawn.move(parts[1])
