def pair():
    knight.jump(2, -1)
    knight.jump(-1, 2)
def long():
    pair()
    knight.jump(1, 2)
    pair()
    knight.jump(-1, -2)
    pair()
pair()
knight.jump(2, -1)
long()
knight.jump(1, 2)
long()
