# expect: error AttributeError
words = knight.read().split()
knight.jump(-2, 1)
for word in words:
    if word == "left":
        knight.jump(-1, 2)
    else:
        knight.jump(1, 2)
