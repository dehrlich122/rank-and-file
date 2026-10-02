taken = 0
while pawn.look("right") == "rook":
    pawn.capture_right()
    taken += 1
print(taken)
pawn.move(2)
