for i in range(2):
    knight.jump(2, -1)
    knight.jump(-2, -1)
    knight.pick_up()
    knight.jump(2, 1)
if "brass" in knight.inventory:
    knight.jump(-1, 2)
    knight.jump(1, 2)
else:
    knight.jump(1, 2)
    knight.jump(-1, 2)
knight.jump(1, 2)
