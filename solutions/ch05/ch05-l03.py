steps = 0
while pawn.look() != "gate":
    if pawn.look() != None:
        pawn.turn_left()
    else:
        pawn.move()
        steps += 1
print(steps)
pawn.move(2)
