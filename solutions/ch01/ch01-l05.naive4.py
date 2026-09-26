# expect: error GateLockedError
# a near miss on the passphrase
pawn.move(3)
pawn.turn_left()
pawn.move(2)
pawn.turn_left()
pawn.move(2)
pawn.turn_right()
pawn.move()
print("checking out")
pawn.move(2)
pawn.turn_right()
pawn.move(4)
