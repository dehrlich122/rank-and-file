pawn.move()
for leg in pawn.read().split(","):
    if leg[0] == "L":
        pawn.turn_left()
    else:
        pawn.turn_right()
    pawn.move(int(leg[1:]))
