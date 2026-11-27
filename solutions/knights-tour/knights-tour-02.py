def out_and_back(route):
    for dx, dy in route:
        knight.jump(dx, dy)
    knight.pick_up()
    for i in range(len(route) - 1, -1, -1):
        dx, dy = route[i]
        knight.jump(-dx, -dy)
    knight.jump(2, -1)
    knight.jump(2, 1)
