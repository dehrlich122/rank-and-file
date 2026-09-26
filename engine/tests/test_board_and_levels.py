import pytest
from conftest import make_level

from rankfile.board import Direction, Tile, square_name, step
from rankfile.levels import LevelError, parse_level, sandbox_level


def test_square_names_follow_chess():
    assert square_name((0, 0)) == "a1"
    assert square_name((2, 3)) == "c4"
    assert square_name((7, 7)) == "h8"


def test_directions_turn_and_step():
    assert Direction.NORTH.turned_right() is Direction.EAST
    assert Direction.NORTH.turned_left() is Direction.WEST
    assert Direction.WEST.turned_right() is Direction.NORTH
    assert step((2, 2), Direction.SOUTH) == (2, 1)


def test_map_top_row_is_the_highest_rank():
    level = make_level(". G\n# .\nP .\n")
    assert (level.board.width, level.board.height) == (2, 3)
    assert level.start == (0, 0)
    assert level.goal == (1, 2)
    assert level.board.tile((0, 1)) is Tile.WALL
    assert level.board.blocked((0, 1))
    assert level.board.blocked((5, 5))  # off the board
    assert not level.board.blocked((1, 1))


def test_legend_signs_hold_text():
    level = make_level("S G\nP .\n", legend={"S": {"tile": "sign", "text": "hello"}})
    assert level.board.tile((0, 1)) is Tile.SIGN
    assert level.board.signs == {(0, 1): "hello"}


def test_describe_is_ready_for_the_ui():
    level = make_level("S G\nP .\n", legend={"S": {"tile": "sign", "text": "hi"}}, start={"facing": "east"})
    described = level.describe()
    assert described["tiles"] == [["floor", "floor"], ["sign", "floor"]]  # tiles[y][x]
    assert described["start"] == {"pos": [0, 0], "facing": "east", "opened": []}
    assert described["goal"] == [1, 1]
    assert described["signs"] == [{"pos": [0, 1], "text": "hi"}]
    assert "hints" not in described


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"map": ". .\n. .\n"}, "start square"),
        ({"map": "P P G\n"}, "more than one start"),
        ({"map": "P G\n. . .\n"}, "same number of squares"),
        ({"map": "P G ?\n"}, "'?'"),
        ({"map": "P .\n"}, "goal square"),
        ({"api": ["fly"]}, "no ability 'fly'"),
        ({"surprise": 1}, "unknown key"),
        ({"constraints": {"max_line": 3}}, "unknown constraint"),
        ({"constraints": {"require_nodes": ["Loop"]}}, "isn't an ast node"),
        ({"objectives": ["win"]}, "unknown objective"),
        ({"start": {"facing": "up"}}, "facing"),
        ({"legend": {"#": "floor"}}, "built-in"),
        ({"legend": {"S": {"tile": "sign"}}}, "needs text"),
        ({"legend": {"X": {"tile": "gate"}}}, "needs passphrase"),
        ({"legend": {"X": {"tile": "gate", "passphrase": "hi", "text": "x"}}}, "doesn.t take text"),
        ({"piece": "dragon"}, "unknown piece"),
    ],
)
def test_bad_levels_fail_loudly(overrides, message):
    with pytest.raises(LevelError, match=message):
        make_level("P G\n", **overrides)


def test_missing_required_keys():
    with pytest.raises(LevelError, match="missing key"):
        parse_level({"id": "x"})


def test_sandbox_is_open_with_no_objectives():
    level = sandbox_level(["move"])
    assert level.goal is None
    assert not level.objectives.reach_goal
    assert level.board.tiles == {}
