# expect: error AttributeError
pawn.move(2)
print(pawn.read().strip().upper())
pawn.move(2)
print(pawn.read().strip().lower().replace("-", " "))
pawn.move(3)
