pawn.move()
text = pawn.read()
pawn.move(3)
if "left" in text:
    pawn.turn_left()
elif "right" in text:
    pawn.turn_right()
pawn.move(4)
