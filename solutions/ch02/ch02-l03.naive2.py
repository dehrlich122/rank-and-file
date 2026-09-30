# expect: error GameArgumentError
pawn.move(pawn.squares_ahead())
pawn.turn_right()
pawn.move(pawn.squares_ahead() / 2)
