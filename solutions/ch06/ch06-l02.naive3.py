# expect: error TypeError
pawn.move(2)
print(pawn.read()[4:])
pawn.move(2)
print(pawn.read()[-3:])
pawn.move(3)
