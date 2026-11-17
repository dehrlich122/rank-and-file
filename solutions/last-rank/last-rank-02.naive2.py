# expect: incomplete
pawn.move()
if not pawn.at_goal():
    for leg in pawn.read().split(", "):
        if leg.startswith("left"):
            pawn.turn_left()
        else:
            pawn.turn_right()
        pawn.move(int(leg.split(" ")[1]))
