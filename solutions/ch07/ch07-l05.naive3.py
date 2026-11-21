# expect: error TypeError
def cross(stones):
    toll = 0
    for i in range(stones):
        knight.jump(1, 2)
        toll += int(knight.read())
    print(toll)
total = cross(1)
knight.jump(1, -2)
total += cross(2)
knight.jump(-2, -1)
total += cross(3)
knight.jump(2, 1)
print(total)
knight.jump(1, -2)
knight.jump(-2, 1)
knight.jump(1, 2)
knight.jump(1, -2)
