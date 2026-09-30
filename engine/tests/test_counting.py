"""Chapter 2's abilities (M3.2): counting the squares ahead, and waiting a number of ticks."""

import pytest

from conftest import events, make_level
from rankfile.runner import run_level

MOVES = ["move", "turn_left", "turn_right"]
GATES = {
    "X": {"tile": "gate", "passphrase": "Open up"},
    "T": {"tile": "timed_gate", "every": 4, "open": 2},
    "S": {"tile": "sign", "text": "Hello"},
    "O": "pit",
}


def counted(map_text: str, code: str = "print(pawn.squares_ahead())") -> str:
    """What the code printed on this map, with squares_ahead unlocked."""
    level = make_level(map_text, api=[*MOVES, "squares_ahead"], legend=GATES)
    return run_level(level, code).output.strip()


@pytest.mark.parametrize(
    ("map_text", "ahead"),
    [
        ("# .\nG .\n. .\nP .\n", "2"),  # a wall; the goal is ordinary floor
        ("G\n.\nP\n", "2"),  # the edge of the board
        ("S G\n. .\nP .\n", "1"),  # a signpost
        ("G\nX\n.\nP\n", "1"),  # a guard's gate, still locked
        ("G\nT\n.\nP\n", "1"),  # a timed gate, even though it's open at the start
        ("G\nO\n.\nP\n", "3"),  # a pit doesn't stop the count
        ("G\n#\nP\n", "0"),  # something right in front
    ],
)
def test_squares_ahead_counts_until_something_could_stop_the_piece(map_text, ahead):
    assert counted(map_text) == ahead


def test_a_guards_gate_counts_as_floor_once_its_open():
    code = "pawn.move()\nprint('Open up')\nprint(pawn.squares_ahead())"
    assert counted("G\nX\n.\nP\n", code).splitlines()[-1] == "2"


def test_counting_is_free():
    level = make_level("G\n.\nP\n", api=[*MOVES, "squares_ahead"])
    result = run_level(level, "pawn.squares_ahead()\npawn.squares_ahead()")
    assert result.final["tick"] == 0 and events(result) == []


def test_squares_ahead_is_locked_until_a_level_unlocks_it():
    result = run_level(make_level("G\n.\nP\n"), "pawn.squares_ahead()")
    assert result.status == "error" and "hasn't learned `squares_ahead`" in result.error.friendly


@pytest.mark.parametrize(("code", "ticks"), [("pawn.wait()", 1), ("pawn.wait(3)", 3), ("pawn.wait(0)", 0)])
def test_wait_takes_a_number_of_ticks(code, ticks):
    level = make_level("G\n.\nP\n", api=[*MOVES, "wait"])
    result = run_level(level, code)
    assert result.final["tick"] == ticks and len(events(result, "wait")) == ticks


@pytest.mark.parametrize(
    ("code", "says"),
    [
        ("pawn.wait('2')", "quote marks"),
        ("pawn.wait(1.5)", "whole number of ticks"),
        ("pawn.wait(-1)", "The fewest is 0"),
        ("pawn.wait(101)", "The most is 100"),
        ("pawn.wait(True)", "needs a number of ticks"),
    ],
)
def test_bad_arguments_to_wait(code, says):
    result = run_level(make_level("G\n.\nP\n", api=[*MOVES, "wait"]), code)
    assert result.status == "error" and says in result.error.friendly
