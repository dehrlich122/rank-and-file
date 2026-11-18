# expect: error BlockedError
def gallop(direction, strides=1):
    for i in range(3):
        knight.jump(direction, -2)
        knight.jump(direction, 2)
