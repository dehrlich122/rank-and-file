def ride(bridges, stones=2):
    total = 0
    for i in range(bridges):
        for j in range(stones):
            knight.jump(1, 2)
            total += int(knight.read())
        knight.jump(1, -2)
    return total
