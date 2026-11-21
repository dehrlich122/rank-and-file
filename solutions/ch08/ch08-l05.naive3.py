# expect: error GateLockedError
for i in range(4):
    knight.jump(1, -2)
    knight.jump(-1, -2)
    knight.pick_up()
    knight.jump(1, 2)
print(min(knight.inventory))
knight.jump(2, 1)
knight.jump(1, -2)
knight.jump(-2, 1)
for key in sorted(knight.inventory):
    print(key)
knight.jump(2, 1)
knight.jump(1, -2)
knight.jump(-2, 1)
knight.jump(1, 2)
