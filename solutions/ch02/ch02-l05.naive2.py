# expect: error BlockedError
ahead = pawn.squares_ahead()
pawn.move(ahead)
pawn.wait(1)
pawn.move(2)
