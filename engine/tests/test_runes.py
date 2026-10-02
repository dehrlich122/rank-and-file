"""Rune tiles and pawn.read() (M3.6): text on the board, read by standing on it."""

import pytest

from conftest import events, make_level
from rankfile.levels import LevelError, parse_level
from rankfile.runner import run_level
from rankfile.world import World

RUNE = {"R": {"tile": "rune", "text": "north-3"}}


def test_read_gives_the_text_of_the_rune_under_the_pawn(rune_corridor):
    result = run_level(rune_corridor, "pawn.move()\nprint(pawn.read())")
    assert result.status == "incomplete"  # it only reads: the goal is still ahead
    assert result.output == "north-3\n"


def test_read_gives_none_off_a_rune(rune_corridor):
    result = run_level(rune_corridor, "print(pawn.read())\npawn.move()\npawn.move()\nprint(pawn.read())")
    assert result.output == "None\nNone\n"


def test_reading_costs_no_tick_and_is_announced_for_playback(rune_corridor):
    result = run_level(rune_corridor, "pawn.move()\npawn.read()\npawn.read()")
    reads = events(result, "read")
    assert [event["at"] for event in reads] == [[1, 1], [1, 1]]
    assert reads[0]["state"]["tick"] == 1  # the one move; reading adds nothing


def test_a_rune_is_floor_the_pawn_walks_over(rune_corridor):
    assert run_level(rune_corridor, "pawn.move(2)").status == "solved"


def test_look_names_a_rune_ahead_and_squares_ahead_walks_past_it(rune_corridor):
    result = run_level(rune_corridor, "print(pawn.look())\nprint(pawn.squares_ahead())")
    assert result.output == "rune\n2\n"


def test_each_board_can_give_a_rune_its_own_text():
    level = make_level(
        "# G #\n# R #\n# P #\n",
        api=["move", "read"],
        legend=RUNE,
        variants=[{"map": "# G #\n# R #\n# P #\n", "legend": {"R": {"tile": "rune", "text": "south-9"}}}],
    )
    first, second = (case.level for case in level.cases())
    assert [first.board.runes, second.board.runes] == [{(1, 1): "north-3"}, {(1, 1): "south-9"}]
    assert [rune["text"] for rune in second.describe()["runes"]] == ["south-9"]


def test_the_world_reads_without_a_listener():
    world = World(make_level("# G #\n# R #\n# P #\n", api=["move", "read"], legend=RUNE))
    assert world.read() is None
    world.move_forward()
    assert world.read() == "north-3"


def test_the_description_lists_each_rune_with_its_text(rune_corridor):
    assert rune_corridor.describe()["runes"] == [{"pos": [1, 1], "text": "north-3"}]
    assert rune_corridor.describe()["tiles"][1][1] == "rune"


def test_an_enemy_can_stand_on_a_rune():
    level = make_level(
        "# G #\n# R #\n# P #\n",
        legend=RUNE,
        enemies=[{"kind": "patrol", "start": "b2"}],
    )
    assert level.enemies[0].start == (1, 1)


@pytest.mark.parametrize(
    ("legend", "problem"),
    [
        ({"R": {"tile": "rune"}}, "needs text"),
        ({"R": {"tile": "rune", "text": ""}}, "needs text"),
        ({"R": {"tile": "rune", "text": "x", "colour": "red"}}, "doesn't take colour"),
    ],
)
def test_a_rune_needs_its_text(legend, problem):
    with pytest.raises(LevelError, match=problem):
        parse_level({"id": "t", "chapter": 1, "title": "t", "trains": "t", "lesson": "t.md", "api": ["move"], "map": "# G #\n# R #\n# P #\n", "legend": legend})


def test_read_is_locked_until_a_level_unlocks_it():
    level = make_level("# G #\n# R #\n# P #\n", legend=RUNE)
    result = run_level(level, "pawn.read()")
    assert result.status == "error"
    assert "read" in result.error.friendly
