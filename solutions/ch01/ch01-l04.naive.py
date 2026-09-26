# expect: error GateLockedError
# says the passphrase before reaching the gate
print("Pawns never retreat")
pawn.move(2)
pawn.turn_left()
pawn.move(2)
