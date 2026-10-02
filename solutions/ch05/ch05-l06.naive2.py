# expect: lost
taken = 0
if pawn.look("right") == "rook":
    pawn.capture_right()
    taken += 1
print(taken)
pawn.move(2)
