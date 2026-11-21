# expect: constraint
total = 0
for i in range(1):
    knight.jump(1, 2)
    total += int(knight.read())
knight.jump(1, -2)
for i in range(2):
    knight.jump(1, 2)
    total += int(knight.read())
knight.jump(-2, -1)
for i in range(3):
    knight.jump(1, 2)
    total += int(knight.read())
knight.jump(2, 1)
print(total)
knight.jump(1, -2)
knight.jump(-2, 1)
knight.jump(1, 2)
knight.jump(1, -2)
