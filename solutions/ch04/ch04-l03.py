pawn.move()
if pawn.look():
    pawn.turn_right()
    pawn.move(2)
    pawn.turn_left()
    pawn.move(3)
    pawn.turn_left()
else:
    pawn.move()
pawn.move(2)
