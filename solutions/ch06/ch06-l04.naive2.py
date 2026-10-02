# expect: lost
pawn.move()
text = pawn.read()
pawn.move(3)
if text == "The old road to the left is the safe one.":
    pawn.turn_left()
elif text == "Keep to the right, traveller. The other roads end in thorns.":
    pawn.turn_right()
pawn.move(4)
