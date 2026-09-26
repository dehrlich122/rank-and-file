# expect: error GateLockedError
# says the passphrase too early, far from the gate
print("Checking out")
pawn.move(3)
pawn.turn_left()
pawn.move(2)
pawn.turn_left()
pawn.move(2)
pawn.turn_right()
pawn.move(3)
pawn.turn_right()
pawn.move(4)
