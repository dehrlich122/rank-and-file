knight.jump(-2, 1)
for word in knight.read().split():
    if word == "left":
        knight.jump(-1, 2)
    else:
        knight.jump(1, 2)
