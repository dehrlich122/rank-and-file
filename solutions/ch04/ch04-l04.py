pawn.move()
if pawn.look() == "pit":
    pawn.bridge()
elif pawn.look() == "wall":
    pawn.turn_left()
    pawn.move(3)
    pawn.turn_right()
    pawn.move(3)
    pawn.turn_right()
pawn.move(3)
