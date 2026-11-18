def gallop(direction, strides=1):
    for i in range(strides):
        knight.jump(direction, -2)
        knight.jump(direction, 2)
