# expect: error BlockedError
for _ in range(5):
    pawn.turn_left()
    pawn.move()
    pawn.turn_right()
    pawn.move(2)
