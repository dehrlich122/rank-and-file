# expect: incomplete
def fetch(strides):
    for i in range(strides):
        knight.jump(1, 2)
        knight.jump(1, -2)
    number = knight.read()
    knight.jump(2, 1)
    return number
