while not pawn.at_goal():
    if pawn.look("left") == "rook" or pawn.look("left") == "patrol":
        pawn.capture_left()
    elif pawn.look("right") == "rook" or pawn.look("right") == "patrol":
        pawn.capture_right()
    elif pawn.look() == "patrol":
        pawn.wait()
    else:
        pawn.move()
