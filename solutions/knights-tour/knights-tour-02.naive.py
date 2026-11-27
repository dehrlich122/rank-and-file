# expect: lost
def out_and_back(route):
    for dx, dy in route:
        knight.jump(dx, dy)
    knight.pick_up()
    knight.jump(2, -1)
    knight.jump(2, 1)
