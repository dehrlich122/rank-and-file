# expect: error TypeError
def fetch(strides):
    number = int(knight.read())
    for i in range(strides):
        knight.jump(1, 2)
        knight.jump(1, -2)
    knight.jump(2, 1)
    return number
