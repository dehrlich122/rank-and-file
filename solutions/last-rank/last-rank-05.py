taken = 0
while pawn.look() != "gate":
    if pawn.look("left") == "rook":
        pawn.capture_left()
        taken += 1
    elif pawn.look("right") == "rook":
        pawn.capture_right()
        taken += 1
    else:
        pawn.move()
print(taken)
pawn.move(2)
text = pawn.read()
if "west" in text:
    pawn.turn_left()
else:
    pawn.turn_right()
for _ in range(int(text.split(" ")[3])):
    if pawn.look() == "pit":
        pawn.bridge()
    pawn.move()
