# expect: error GateLockedError
steps = 0
while pawn.look() != "gate":
    if pawn.look() == "pit":
        pawn.turn_left()
        pawn.move()
        pawn.turn_right()
        pawn.move(2)
        pawn.turn_right()
        pawn.move()
        pawn.turn_left()
        steps += 1
    else:
        pawn.move()
        steps += 1
print(steps)
pawn.move(2)
