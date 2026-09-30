for _ in range(5):
    pawn.turn_left()
    pawn.move(pawn.squares_ahead())
    pawn.turn_right()
    pawn.move(pawn.squares_ahead())
