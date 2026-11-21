# expect: error UnboundLocalError
total = 0
def cross(stones):
    for i in range(stones):
        knight.jump(1, 2)
        total += int(knight.read())
cross(1)
knight.jump(1, -2)
cross(2)
knight.jump(-2, -1)
cross(3)
knight.jump(2, 1)
print(total)
knight.jump(1, -2)
knight.jump(-2, 1)
knight.jump(1, 2)
knight.jump(1, -2)
