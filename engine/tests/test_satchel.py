"""M5.3's keys, doors and the satchel: the two tiles as the level file writes them, what stays true of every other
level, and how the world behaves (picking up a key, landing on a door, the Challenge panel's sentences)."""

import pytest

from conftest import events, make_level
from rankfile.board import Direction, Tile
from rankfile.exceptions import BlockedError, DoorLockedError, GameError, Lost, PickUpError
from rankfile.levels import LevelError, editor_options
from rankfile.pieces import Knight, Piece
from rankfile.runner import run_level
from rankfile.world import World

KNIGHT_API = list(Knight.ABILITIES)
VAULT = """
. . . . .
. K . D G
. . P . .
"""


def vault(name="brass", wants="brass", **overrides):
    legend = {"K": {"tile": "key", "name": name}, "D": {"tile": "door", "key": wants}}
    return make_level(VAULT, piece="knight", api=KNIGHT_API, legend=legend, **overrides)


@pytest.mark.parametrize("name", ["brass", 7])
def test_keys_and_doors_parse_from_a_legend(name):
    level = vault(name, name)
    assert level.board.tile((1, 1)) is Tile.KEY and level.board.tile((3, 1)) is Tile.DOOR
    assert level.board.keys == {(1, 1): name}
    assert level.board.doors == {(3, 1): name}


@pytest.mark.parametrize("name", ["brass", 7])
def test_a_level_with_keys_and_doors_describes_them(name):
    info = vault(name, name).describe()
    assert info["keys"] == [{"pos": [1, 1], "name": name}]
    assert info["doors"] == [{"pos": [3, 1], "key": name}]
    assert info["tiles"][1][1] == "key" and info["tiles"][1][3] == "door"


def test_a_level_with_only_keys_describes_no_doors():
    level = make_level(VAULT.replace("D", "."), piece="knight", api=KNIGHT_API, legend={"K": {"tile": "key", "name": "brass"}})
    info = level.describe()
    assert info["keys"] == [{"pos": [1, 1], "name": "brass"}]
    assert "doors" not in info


def test_every_other_level_describes_itself_as_before():
    info = make_level(". . .\nP . G").describe()
    assert "keys" not in info and "doors" not in info
    assert "inventory" not in info["start"]


def test_a_door_whose_key_is_on_no_board_is_refused():
    with pytest.raises(LevelError, match="wants the key 'copper'") as refused:
        vault("brass", "copper")
    assert refused.value.at == {"square": "d2"}


def test_a_key_on_another_board_of_the_level_will_do():
    other = {"map": ". . . . .\n. K . . G\n. . P . .", "legend": {"K": {"tile": "key", "name": "copper"}}}
    level = vault("brass", "copper", variants=[other])
    assert level.variants[0].board.keys == {(1, 1): "copper"}


def test_text_and_number_names_cannot_mix_in_one_level():
    with pytest.raises(LevelError, match="text or with whole numbers, not both"):
        vault("brass", 7)
    other = {"map": ". . . . .\n. K . . G\n. . P . .", "legend": {"K": {"tile": "key", "name": 7}}}
    with pytest.raises(LevelError, match="text or with whole numbers, not both"):
        vault("brass", "brass", variants=[other])


@pytest.mark.parametrize("bad", [True, 1.5, "", None, ["a"]])
def test_a_name_is_text_or_a_whole_number(bad):
    with pytest.raises(LevelError, match="needs name: text or a whole number"):
        vault(bad, "brass")


def test_a_key_tile_takes_a_name_and_a_door_takes_a_key():
    with pytest.raises(LevelError, match="a key doesn't take key"):
        make_level(VAULT, legend={"K": {"tile": "key", "key": "brass"}, "D": {"tile": "key", "name": "x"}})
    with pytest.raises(LevelError, match="a door needs key"):
        make_level(VAULT, legend={"K": {"tile": "key", "name": "x"}, "D": {"tile": "door"}})


def test_the_satchel_starts_empty_and_is_copied():
    world = World(vault())
    assert world.inventory == [] and world.satchel
    twin = world.copy()
    twin.inventory.append("brass")
    assert world.inventory == []
    assert world.state()["inventory"] == [] and twin.state()["inventory"] == ["brass"]


def test_no_inventory_in_the_state_without_keys_or_doors():
    world = World(make_level(". . .\nP . G"))
    assert not world.satchel
    assert "inventory" not in world.state()


def test_the_two_errors_are_the_games():
    assert issubclass(PickUpError, GameError)
    assert issubclass(DoorLockedError, BlockedError)
    assert DoorLockedError("shut", at=(3, 1)).at == (3, 1)


def test_pick_up_and_inventory_are_the_knights_last_two_abilities():
    assert Knight.ABILITIES[-2:] == ("pick_up", "inventory")
    assert not hasattr(Piece, "UNBUILT") and not hasattr(Knight, "UNBUILT")


def test_neither_tile_is_a_special_case_for_the_editors_options():
    options = editor_options()["tiles"]
    assert options["key"] == {"needs": ["name"], "may": []}
    assert options["door"] == {"needs": ["key"], "may": []}


# -- the world (M5.3-2) ---------------------------------------------------------------
#
# The knight starts on c1. The key is on d3 (jump(1, 2)), the doors on e2 (jump(2, 1)) and a2 (jump(-2, 1)).
# The tests drive the World directly and move the piece by hand where a jump can't get there.

KEY_SQUARE, DOOR_SQUARE, OTHER_DOOR = (3, 2), (4, 1), (0, 1)
STONE = "G . . K .\nD . . . D\n. . P . .\n"


def stone(name="brass", wants="brass", second_door=True, **overrides):
    text = STONE if second_door else STONE.replace("D . . . D", ". . . . D")
    legend = {"K": {"tile": "key", "name": name}, "D": {"tile": "door", "key": wants}}
    return make_level(text, piece="knight", api=KNIGHT_API, legend=legend, **overrides)


def recording(level):
    """A World on `level` and the list its events go into."""
    world, seen = World(level), []
    world.listeners.append(seen.append)
    return world, seen


def kinds(seen):
    return [event["kind"] for event in seen]


def carry_the_key(world):
    """Pick up the key on d3 and go back to c1."""
    world.pos = KEY_SQUARE
    world.pick_up()
    world.pos = (2, 0)


@pytest.mark.parametrize(
    ("name", "said"),
    [("brass", "the brass key. Its satchel holds ['brass']."), (12, "key 12. Its satchel holds [12].")],
)
def test_pick_up_takes_the_key_the_piece_stands_on(name, said):
    world, seen = recording(stone(name, name))
    world.jump(1, 2)
    seen.clear()
    world.pick_up()
    assert world.inventory == [name] and KEY_SQUARE in world.collected
    assert kinds(seen) == ["pick_up"]
    event = seen[0]
    assert event["at"] == [3, 2] and event["message"] == f"Your knight picked up {said}"
    assert event["state"]["inventory"] == [name] and event["state"]["collected"] == [[3, 2]]
    assert world.ticks["action"] == 2  # the jump and the pick-up: one action each


def test_the_satchel_lists_keys_in_the_order_they_were_picked_up():
    level = make_level(
        "G . . K .\n. . . . J\n. . P . .\n",
        piece="knight",
        api=KNIGHT_API,
        legend={"K": {"tile": "key", "name": 7}, "J": {"tile": "key", "name": 12}},
    )
    world, seen = recording(level)
    world.pos = (4, 1)
    world.pick_up()
    world.pos = KEY_SQUARE
    world.pick_up()
    assert world.inventory == [12, 7]
    assert seen[-1]["message"] == "Your knight picked up key 7. Its satchel holds [12, 7]."


def test_landing_on_a_key_does_not_take_it():
    world = World(stone())
    world.jump(1, 2)
    assert world.inventory == [] and world.collected == set()


def test_pick_up_with_nothing_there_is_an_error_and_changes_nothing():
    world, seen = recording(stone())
    with pytest.raises(PickUpError) as raised:
        world.pick_up()
    assert str(raised.value) == "There is nothing to pick up on c1."
    assert (world.inventory, world.collected, world.ticks["action"], seen) == ([], set(), 0, [])


def test_a_second_pick_up_on_the_same_stone_is_an_error():
    world = World(stone())
    world.pos = KEY_SQUARE
    world.pick_up()
    before = (list(world.inventory), set(world.collected), world.ticks["action"])
    with pytest.raises(PickUpError, match="There is nothing to pick up on d3."):
        world.pick_up()
    assert (world.inventory, world.collected, world.ticks["action"]) == before


def test_a_lost_piece_cannot_pick_up():
    world = World(stone())
    world.pos = KEY_SQUARE
    world.lost = Lost("lost", KEY_SQUARE)
    with pytest.raises(Lost):
        world.pick_up()
    assert world.inventory == []


@pytest.mark.parametrize(("name", "other", "wants"), [("brass", "iron", "the brass key"), (12, 7, "key 12")])
def test_a_door_without_its_key_is_a_bump_and_an_error(name, other, wants):
    level = make_level(
        "G . . K .\n. . . . D\n. . P . .\n",
        piece="knight",
        api=KNIGHT_API,
        legend={"K": {"tile": "key", "name": other}, "D": {"tile": "door", "key": name}},
        variants=[{"map": "G . . . .\n. . . . .\n. . P . E", "legend": {"E": {"tile": "key", "name": name}}}],
    )
    world, seen = recording(level)
    with pytest.raises(DoorLockedError) as empty:
        world.jump(2, 1)
    assert empty.value.at == DOOR_SQUARE
    assert str(empty.value) == f"The door on e2 is locked: it wants {wants}, and your satchel is empty."
    assert [(event["kind"], event["at"]) for event in seen] == [("bump", [4, 1])]
    assert world.pos == (2, 0) and world.ticks["action"] == 0
    carry_the_key(world)
    with pytest.raises(DoorLockedError) as holding:
        world.jump(2, 1)
    assert str(holding.value) == f"The door on e2 is locked: it wants {wants}, and your satchel holds {[other]!r}."


def test_landings_leave_out_a_locked_door_until_its_key_is_carried():
    world = World(stone())
    assert DOOR_SQUARE not in world.landings() and KEY_SQUARE in world.landings()
    assert list(DOOR_SQUARE) not in world.state()["landings"]
    carry_the_key(world)
    assert DOOR_SQUARE in world.landings() and list(DOOR_SQUARE) in world.state()["landings"]


def test_walking_into_a_locked_door_is_the_same_error():
    world, seen = recording(stone())
    world.pos, world.facing = (4, 0), Direction.NORTH
    with pytest.raises(DoorLockedError) as raised:
        world.move_forward()
    assert raised.value.at == DOOR_SQUARE and "The door on e2 is locked" in str(raised.value)
    assert [(event["kind"], event["at"]) for event in seen] == [("bump", [4, 1])] and world.pos == (4, 0)
    carry_the_key(world)
    world.pos = (4, 0)
    world.move_forward()
    assert world.pos == DOOR_SQUARE


def test_from_the_pick_up_on_the_doors_are_open_for_good():
    world, seen = recording(stone())
    world.pos = KEY_SQUARE
    assert world.state()["opened"] == []
    world.pick_up()
    assert seen[-1]["state"]["opened"] == [[0, 1], [4, 1]]  # both doors want this key
    for _ in range(3):  # as often as it likes
        world.pos = (2, 0)
        world.jump(2, 1)
        assert world.pos == DOOR_SQUARE
    world.pos = (2, 0)
    world.jump(-2, 1)
    assert world.pos == OTHER_DOOR and world.state()["opened"] == [[0, 1], [4, 1]]


def test_a_door_wants_only_its_own_key():
    level = make_level(
        ". . K . G\nD . . J .\n. . P . .\n",
        piece="knight",
        api=KNIGHT_API,
        legend={"K": {"tile": "key", "name": "brass"}, "J": {"tile": "key", "name": "iron"}, "D": {"tile": "door", "key": "iron"}},
    )
    world = World(level)
    world.pos = (2, 2)
    world.pick_up()
    assert world.state()["opened"] == [] and OTHER_DOOR not in world.landings()
    world.pos = (3, 1)
    world.pick_up()
    assert world.state()["opened"] == [[0, 1]]


def test_a_copy_of_the_world_has_its_own_satchel_and_the_same_doors():
    world = World(stone())
    twin = world.copy()
    twin.pos = KEY_SQUARE
    twin.pick_up()
    assert world.inventory == [] and world.state()["opened"] == [] and twin.state()["opened"] == [[0, 1], [4, 1]]
    carry_the_key(world)
    copied = world.copy()
    copied.jump(2, 1)
    assert copied.pos == DOOR_SQUARE and copied.state()["inventory"] == ["brass"]


def test_look_names_a_key_until_it_is_taken_and_a_door_until_its_key_is_carried():
    world = World(stone())
    assert (world.look_at(1, 2), world.look_at(2, 1)) == ("key", "door")
    world.pos, world.facing = (4, 0), Direction.NORTH
    assert world.look() == "door"
    carry_the_key(world)
    assert (world.look_at(1, 2), world.look_at(2, 1)) == (None, None)
    world.pos = (4, 0)
    assert world.look() is None


def test_a_chaser_cannot_cross_a_locked_door_and_can_once_it_is_open():
    level = make_level(
        "K . . . G\nP . . D .\n",
        piece="knight",
        api=KNIGHT_API,
        legend={"K": {"tile": "key", "name": "brass"}, "D": {"tile": "door", "key": "brass"}},
        enemies=[{"kind": "chaser", "start": "e1"}],
    )
    world = World(level)
    world.wait()
    assert world.foes[0].pos == (4, 0)
    world.pos = (0, 1)
    world.pick_up()  # its tick: the chaser walks onto the opened door
    assert world.foes[0].pos == (3, 0)


def test_squares_ahead_stops_at_a_locked_door_only():
    world = World(stone(second_door=False))
    world.pos, world.facing = (4, 0), Direction.NORTH
    assert world.squares_ahead() == 0
    carry_the_key(world)
    world.pos = (4, 0)
    assert world.squares_ahead() == 2  # e2 and e3: the board's edge ends it


# -- the Challenge panel -----------------------------------------------------------------


def test_one_key_and_one_door_are_described():
    assert stone(second_door=False).obstacles() == [
        "A key on d3: land on its stone and `pick_up()` puts it in your satchel.",
        "A door on e2: you can land on it only while you carry the brass key.",
    ]
    assert stone(7, 7, second_door=False).obstacles()[1] == "A door on e2: you can land on it only while you carry key 7."


def test_several_keys_and_doors_are_described():
    legend = {"K": {"tile": "key", "name": 1}, "J": {"tile": "key", "name": 2}, "L": {"tile": "key", "name": 3}, "D": {"tile": "door", "key": 1}}
    level = make_level("K . . J D\n. . . . D\nL . P . G\n", piece="knight", api=KNIGHT_API, legend=legend)
    assert level.obstacles() == [
        "Keys on a1, a3 and d3: land on a key's stone and `pick_up()` puts it in your satchel.",
        "Doors on e2 and e3: you can land on one only while you carry the key it names.",
    ]


def test_keys_come_after_the_timed_gates_and_before_the_enemies():
    legend = {"K": {"tile": "key", "name": "brass"}, "D": {"tile": "door", "key": "brass"}, "T": {"tile": "timed_gate", "every": 3}}
    level = make_level("K . T D G\nP . . . .\n", piece="knight", api=KNIGHT_API, legend=legend, enemies=[{"kind": "patrol", "start": "c1"}])
    said = level.obstacles()
    where = [next(i for i, text in enumerate(said) if text.startswith(start)) for start in ("The gate", "A key", "A door", "A patrol")]
    assert where == sorted(where)


def test_a_level_without_keys_and_doors_says_nothing_of_them():
    assert not any("key" in text or "door" in text for text in make_level(". . .\nP . G").obstacles())


# -- a level file --------------------------------------------------------------------------


def test_keys_and_doors_are_for_the_knight():
    key, door = {"K": {"tile": "key", "name": "brass"}}, {"D": {"tile": "door", "key": "brass"}}
    with pytest.raises(LevelError, match="keys and doors are for the knight: the pawn learns them in M5.5") as refused:
        make_level(VAULT, legend={**key, **door})
    assert refused.value.at == {"field": "piece"}
    with pytest.raises(LevelError, match="keys and doors are for the knight"):
        make_level(VAULT.replace("D", "."), legend=key)


# -- the abilities, through a run (M5.3-3a) ---------------------------------------------------
#
# The knight starts on c1. The key is on d3 (jump(1, 2)), the doors on a2 and e2 (jump(2, 1)), the goal on c3.

CROSSING = """
. . G K .
D . . . D
. . P . .
"""
WALK_THROUGH = "knight.jump(1, 2)\nknight.pick_up()\nknight.jump(-1, -2)\nknight.jump(2, 1)\nknight.jump(-2, 1)"


def crossing(api=KNIGHT_API):
    legend = {"K": {"tile": "key", "name": "brass"}, "D": {"tile": "door", "key": "brass"}}
    return make_level(CROSSING, piece="knight", api=api, legend=legend)


def test_a_run_picks_up_a_key_and_lands_on_its_door():
    result = run_level(crossing(), WALK_THROUGH)
    assert result.status == "solved"
    (step,) = [step for step in result.steps if any(event["kind"] == "pick_up" for event in step["events"])]
    assert step["line"] == 2  # the line that called pick_up()
    assert [event["at"] for event in step["events"]] == [[3, 2]]
    before, after = events(result, "jump")[0]["state"], events(result, "pick_up")[0]["state"]
    assert (before["inventory"], before["opened"]) == ([], [])  # landing on the key's stone took nothing
    assert (after["inventory"], after["opened"]) == (["brass"], [[0, 1], [4, 1]])
    assert result.final["inventory"] == ["brass"] and result.final["opened"] == [[0, 1], [4, 1]]
    assert result.start["inventory"] == [] and result.start["opened"] == []


INVENTORY_AS_A_LIST = """
print(knight.inventory, len(knight.inventory))
knight.jump(1, 2)
knight.pick_up()
a = knight.inventory
b = knight.inventory
print(a == b, a is b, len(a), "brass" in a, a == ["brass"], a)
for name in a:
    print(name)
a.append("iron")
print(knight.inventory, a)
"""


def test_the_inventory_in_player_code_is_a_list_of_its_own():
    result = run_level(crossing(), INVENTORY_AS_A_LIST)
    assert result.error is None
    assert result.output == "[] 0\nTrue False 1 True True ['brass']\nbrass\n['brass'] ['brass', 'iron']\n"
    assert result.final["inventory"] == ["brass"]  # the copy's append changed nothing on the board
    assert all(event["state"]["inventory"] == ["brass"] for event in events(result, "pick_up"))


def test_pick_up_with_no_key_on_the_square_is_an_error_not_a_lost_run():
    result = run_level(crossing(), "knight.pick_up()")
    assert result.status == "error" and result.error.type == "PickUpError" and result.error.line == 1
    assert result.error.friendly == "There is nothing to pick up on c1."
    assert result.final["inventory"] == [] and not events(result, "pick_up")


def test_jumping_onto_a_locked_door_is_an_error_in_the_doors_own_words():
    result = run_level(crossing(), "knight.wait()\nknight.jump(2, 1)")
    assert result.status == "error" and result.error.type == "DoorLockedError" and result.error.line == 2
    assert result.error.friendly == "The door on e2 is locked: it wants the brass key, and your satchel is empty."
    assert [event["at"] for event in events(result, "bump")] == [[4, 1]]
    assert result.final["pos"] == [2, 0]


@pytest.mark.parametrize("name", ["pick_up", "inventory"])
def test_a_level_that_does_not_list_them_keeps_them_locked(name):
    level = crossing(api=["jump"])
    locked = run_level(level, f"knight.{name}")
    other = run_level(level, "knight.read")
    assert locked.error.type == "LockedAbilityError"
    assert locked.error.friendly == other.error.friendly.replace("read", name)
    assert name in locked.error.friendly and "knows: jump" in locked.error.friendly


@pytest.mark.parametrize("api", [["jump"], KNIGHT_API])
def test_the_satchel_cannot_be_assigned(api):
    result = run_level(crossing(api), "knight.inventory = []")
    assert result.error.type == "CantChangePieceError"
    assert result.error.friendly == "You can't change the knight's `inventory` directly. The knight has to use its own abilities."


@pytest.mark.parametrize("name", ["pick_up", "inventory"])
def test_the_pawn_still_reads_them_as_made_up_names(name):
    level = make_level(". . G\nP . .\n")
    mine = run_level(level, f"pawn.{name}")
    made_up = run_level(level, "pawn.fetch")
    assert mine.error.type == "AttributeError"
    assert mine.error.friendly == made_up.error.friendly.replace("fetch", name)
