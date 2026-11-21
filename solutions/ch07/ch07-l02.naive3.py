# expect: error NameError
figure()
knight.jump(2, -1)
figure()
knight.jump(1, 2)
figure()
def figure():
    knight.jump(1, 2)
    knight.jump(1, -2)
    knight.jump(-2, -1)
    knight.jump(2, -1)
