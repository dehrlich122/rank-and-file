# expect: error GateLockedError
hall = pawn.squares_ahead()
pawn.move(hall)
pawn.turn_right()
pawn.move()
print('False')
pawn.move(2)
print('True')
pawn.move(2)
