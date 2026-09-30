# expect: lost
for steps in range(2, 0, -1):
    pawn.turn_left()
    pawn.move()
    pawn.turn_right()
    pawn.move()
    pawn.turn_left()
    pawn.move(steps)
pawn.turn_right()
for n in range(1, 3):
    pawn.move(n)
    pawn.turn_left()
for _ in range(3):
    pawn.move()
    pawn.turn_right()
    pawn.move()
    pawn.turn_left()
pawn.move(2)
