"""The obstacle toolkit (M3.1): ticks, losing, pits and waiting."""

import pytest

from conftest import make_level
from rankfile.runner import run_level

API = ["move", "turn_left", "turn_right", "at_goal", "wait"]


def events(result, kind=None):
    return [event for step in result.steps for event in step["events"] if kind is None or event["kind"] == kind]


@pytest.fixture
def pits():
    """Pawn on a1 facing north; a pit on a3; the goal on b3."""
    return make_level(". . .\nO G .\n. . .\nP . .\n", legend={"O": {"tile": "pit"}}, api=API)


# -- ticks -------------------------------------------------------------------------


def test_every_square_turn_and_wait_is_a_tick(pits):
    result = run_level(pits, "pawn.turn_right()\npawn.move(2)\npawn.wait()\npawn.turn_left()")
    # The piece acts, then the tick is over: each event shows the ticks before it.
    assert [event["state"]["tick"] for event in events(result)] == [0, 1, 2, 3, 4]
    assert result.final["tick"] == 5


def test_asking_the_board_costs_no_tick(pits):
    result = run_level(pits, "pawn.at_goal()\npawn.at_goal()")
    assert result.final["tick"] == 0


def test_the_start_state_has_no_ticks_and_is_not_lost(pits):
    start = pits.describe()["start"]
    assert (start["tick"], start["lost"]) == (0, None)


def test_waiting_stands_still(pits):
    result = run_level(pits, "pawn.wait()")
    assert [event["kind"] for event in events(result)] == ["wait"]
    assert result.final["pos"] == [0, 0]


def test_waiting_is_locked_unless_the_level_unlocks_it():
    level = make_level("G\nP\n")
    result = run_level(level, "pawn.wait()")
    assert result.error.type == "LockedAbilityError"


# -- pits and losing -----------------------------------------------------------------


def test_stepping_into_a_pit_loses_the_run(pits):
    result = run_level(pits, "pawn.move()\npawn.move()\npawn.turn_right()")
    assert result.status == "lost"
    assert result.summary == "Your pawn fell into the pit on a3."
    assert result.final["pos"] == [0, 2]
    assert result.final["lost"] == [0, 2]
    lost = events(result, "lost")
    assert [(event["at"], event["message"]) for event in lost] == [([0, 2], "Your pawn fell into the pit on a3.")]
    assert result.steps[-1]["line"] == 2  # the turn never ran
    assert result.error.line == 2
    assert result.error.traceback == ""  # the game ended it, not Python
    assert result.stars == []


def test_a_long_move_stops_in_the_pit(pits):
    result = run_level(pits, "pawn.move(3)")
    assert result.status == "lost"
    assert result.final["pos"] == [0, 2]


def test_except_exception_cannot_swallow_a_loss(pits):
    code = "try:\n    pawn.move(2)\nexcept Exception:\n    pass\npawn.turn_right()\npawn.move()"
    result = run_level(pits, code)
    assert result.status == "lost"
    assert result.error.line == 2
    assert 5 not in [step["line"] for step in result.steps]


def test_a_lost_run_stays_lost_even_if_the_code_catches_it(pits):
    code = "try:\n    pawn.move(2)\nexcept BaseException:\n    pass\npawn.turn_right()\npawn.move()"
    result = run_level(pits, code)
    assert result.status == "lost"
    assert result.summary == "Your pawn fell into the pit on a3."
    assert result.error.line == 2  # where it was lost, not where the code tried to carry on
    assert result.final["pos"] == [0, 2]  # the pawn never climbed out


def test_pits_are_drawn():
    level = make_level("O\nG\nP\n", legend={"O": "pit"})
    assert level.describe()["tiles"][2] == ["pit"]
