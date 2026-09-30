walked = pawn.squares_ahead() - 1
pawn.move(walked)
pawn.turn_right()
pawn.move(walked * 2)
