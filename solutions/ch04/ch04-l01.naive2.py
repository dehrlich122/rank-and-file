# expect: error GateLockedError
hall = pawn.squares_ahead()
pawn.move(hall)
pawn.turn_right()
pawn.move()
print(hall > 4)
pawn.move(2)
print(hall > 4)
pawn.move(2)
