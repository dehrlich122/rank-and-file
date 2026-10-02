# expect: incomplete
steps = 0
if pawn.look() != "gate":
    if pawn.look() != None:
        pawn.turn_left()
    else:
        pawn.move()
        steps += 1
print(steps)
pawn.move(2)
