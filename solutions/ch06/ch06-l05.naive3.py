# expect: incomplete
pawn.move()
text = pawn.read()
pawn.move(int(text[0]))
pawn.turn_left()
pawn.move(int(text[-1]))
