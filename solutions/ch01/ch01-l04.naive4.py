# expect: error GateLockedError
# the passphrase in the wrong case
pawn.move(2)
pawn.turn_left()
print("pawns never retreat")
pawn.move(2)
