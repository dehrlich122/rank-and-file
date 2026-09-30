ahead = pawn.squares_ahead()
pawn.move(ahead)
pawn.wait(4 - ahead % 4)
pawn.move(2)
