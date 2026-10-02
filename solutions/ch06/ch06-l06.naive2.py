# expect: incomplete
pawn.move()
parts = pawn.read().split(",")
for number in range(2):
    leg = parts[number]
    if leg[0] == "L":
        pawn.turn_left()
    else:
        pawn.turn_right()
    pawn.move(int(leg[1:]))
