# expect: error GateLockedError
pawn.move(2)
text = pawn.read().strip()
print(text)
pawn.move(2)
print(text)
pawn.move(3)
