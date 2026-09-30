for _ in range(3):
    for _ in range(3):
        pawn.turn_left()
        pawn.move()
        pawn.turn_right()
        pawn.move()
    pawn.turn_left()
    pawn.move(2)
