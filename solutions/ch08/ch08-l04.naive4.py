# expect: error JumpError
route = []
for i in range(4):
    knight.jump(2, -1)
    route.append(knight.read())
for side in route:
    knight.jump(side, 2)
