for _ in range(7):
    if pawn.look("left") == "rook":
        pawn.capture_left()
    elif pawn.look("right") == "rook":
        pawn.capture_right()
    else:
        pawn.move()
