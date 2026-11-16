# expect: error ValueError
pawn.move()
while not pawn.at_goal():
    leg = pawn.read()
    if leg.startswith("left"):
        pawn.turn_left()
    else:
        pawn.turn_right()
    pawn.move(int(leg.split(" ")[1]))
