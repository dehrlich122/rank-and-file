pawn.move(3)
if pawn.look("left") == "rook":
    pawn.capture_left()
elif pawn.look("right") == "rook":
    pawn.capture_right()
else:
    pawn.move()
