# expect: incomplete
if not pawn.at_goal():
    pawn.turn_left()
    pawn.move(pawn.squares_ahead())
