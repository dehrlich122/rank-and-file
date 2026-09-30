for steps in range(1, 4):
    for _ in range(steps):
        pawn.turn_left()
        pawn.move()
        pawn.turn_right()
        pawn.move()
    pawn.turn_left()
    pawn.move(2)
