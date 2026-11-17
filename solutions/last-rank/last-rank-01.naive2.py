# expect: lost
steps = 0
if pawn.look() != "gate":
    if pawn.look() == "pit":
        pawn.turn_left()
        pawn.move()
        pawn.turn_right()
        pawn.move(2)
        pawn.turn_right()
        pawn.move()
        pawn.turn_left()
        steps += 4
    else:
        pawn.move()
        steps += 1
print(steps)
pawn.move(2)
