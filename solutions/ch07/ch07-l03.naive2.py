# expect: incomplete
def gallop(direction, strides):
    for i in range(strides):
        knight.jump(direction, -2)
        knight.jump(direction, 2)
