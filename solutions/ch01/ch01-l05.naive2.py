# expect: error GateLockedError
# the old route, with nothing said at the gate
pawn.move(3)
pawn.turn_left()
pawn.move(2)
pawn.turn_left()
pawn.move(2)
pawn.turn_right()
pawn.move(3)
pawn.turn_right()
pawn.move(4)
