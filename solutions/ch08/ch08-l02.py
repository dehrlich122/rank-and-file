def visit(stops):
    for x, y in stops:
        here_x, here_y = knight.position
        knight.jump(x - here_x, y - here_y)
