# expect: lost
while not pawn.at_goal():
    if pawn.look("left") == "rook":
        pawn.capture_left()
    elif pawn.look("right") == "rook":
        pawn.capture_right()
    elif pawn.look() == "patrol":
        pawn.wait()
    else:
        pawn.move()
