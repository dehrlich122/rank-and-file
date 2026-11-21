# expect: incomplete
def fetch_keys(hub, places):
    hub_x, hub_y = hub
    x, y = knight.position
    knight.jump(hub_x - x, hub_y - y)
    for x, y in places:
        knight.jump(x - hub_x, y - hub_y)
        knight.pick_up()
        knight.jump(hub_x - x, hub_y - y)
    return knight.inventory
