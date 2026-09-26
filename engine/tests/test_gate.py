"""The locked gate: opened by saying its passphrase from a square next to it."""

import json

import pytest
from conftest import make_level

from rankfile.runner import run_level
from rankfile.world import GUARD_GATE_LOCKED, GUARD_WRONG_PHRASE

PHRASE = "Open sesame"


@pytest.fixture
def gated():
    """Pawn on b1 facing north; a gate on b3; the goal on b4 behind it."""
    return make_level(
        "# G #\n. X .\n. . .\n. P .\n",
        legend={"X": {"tile": "gate", "passphrase": PHRASE}},
    )


def events(result, kind):
    return [event for step in result.steps for event in step["events"] if event["kind"] == kind]


def test_the_passphrase_from_next_to_the_gate_opens_it(gated):
    result = run_level(gated, f'pawn.move()\nprint("{PHRASE}")\npawn.move(2)')
    assert result.status == "solved"
    assert result.final["opened"] == [[1, 2]]
    opened = events(result, "gate_open")
    assert opened == [{"kind": "gate_open", "state": {"pos": [1, 1], "facing": "north", "opened": [[1, 2]]}, "at": [1, 2]}]
    assert result.steps[1]["events"] == opened  # attached to the line that printed it


def test_facing_does_not_matter(gated):
    code = f'pawn.move()\npawn.turn_left()\npawn.turn_left()\nprint("{PHRASE}")\npawn.turn_right()\npawn.turn_right()\npawn.move(2)'
    assert run_level(gated, code).status == "solved"


def test_any_side_of_the_gate_works(gated):
    code = f'pawn.turn_right()\npawn.move()\npawn.turn_left()\npawn.move(2)\nprint("{PHRASE}")'
    result = run_level(gated, code)  # ends on c3, east of the gate
    assert result.final["opened"] == [[1, 2]]


def test_two_squares_away_is_too_far(gated):
    result = run_level(gated, f'print("{PHRASE}")\npawn.move(3)')
    assert events(result, "gate_open") == []
    assert events(result, "guard") == []  # nobody is listening that far away
    assert result.status == "error"
    assert result.error.type == "GateLockedError"


@pytest.mark.parametrize("near_miss", [PHRASE.lower(), f"'{PHRASE}'", PHRASE + "!", PHRASE + " ", "hello"])
def test_anything_else_gets_the_guards_reply_and_the_run_goes_on(gated, near_miss):
    code = f"pawn.move()\nprint({near_miss!r})\nafter = 'still going'\npawn.move()"
    result = run_level(gated, code)
    guard = events(result, "guard")
    assert [event["message"] for event in guard] == [GUARD_WRONG_PHRASE]
    assert [step["line"] for step in result.steps] == [1, 2, 3, 4]  # the program carried on
    assert result.final["opened"] == []
    assert result.error.type == "GateLockedError"


def test_every_other_line_said_next_to_the_gate_gets_a_reply(gated):
    result = run_level(gated, f'pawn.move()\nprint("hi")\nprint("{PHRASE}")\nprint("thanks")\npawn.move(2)')
    assert len(events(result, "guard")) == 1  # "thanks" is said to an open gate, which isn't listening
    assert result.status == "solved"


def test_walking_into_the_locked_gate_stops_the_run(gated):
    result = run_level(gated, "pawn.move(2)\nprint('never printed')")
    assert result.status == "error"
    assert result.error.friendly == GUARD_GATE_LOCKED
    assert result.error.line == 1
    assert result.error.traceback.rstrip().splitlines()[-1] == f"GateLockedError: {GUARD_GATE_LOCKED}"
    assert events(result, "bump")[-1]["at"] == [1, 2]
    assert result.output == ""


def test_after_a_wrong_phrase_the_error_points_back_to_it(gated):
    result = run_level(gated, "pawn.move()\nprint('open sesame')\npawn.move()")
    assert result.error.type == "GateLockedError"
    assert result.error.line == 3  # the crash is still at the move
    assert result.error.friendly == f"{GUARD_GATE_LOCKED}\nThe guard didn't accept what line 2 printed."


def test_the_pointer_names_the_most_recent_wrong_phrase(gated):
    result = run_level(gated, "pawn.move()\nprint('hello')\nprint('open sesame')\npawn.move()")
    assert result.error.friendly.endswith("The guard didn't accept what line 3 printed.")


def test_no_pointer_when_the_guard_never_heard_anything(gated):
    too_far = run_level(gated, f'print("{PHRASE}")\npawn.move()\npawn.move()')
    assert too_far.error.friendly == GUARD_GATE_LOCKED
    silent = run_level(gated, "pawn.move()\npawn.move()")
    assert silent.error.friendly == GUARD_GATE_LOCKED


def test_a_line_printed_in_pieces_is_heard_whole(gated):
    code = 'pawn.move()\nprint("Open", end=" ")\nprint("sesame")\npawn.move(2)'
    assert run_level(gated, code).status == "solved"


def test_a_last_line_without_a_newline_still_counts(gated):
    result = run_level(gated, f'pawn.move()\nprint("{PHRASE}", end="")')
    assert result.final["opened"] == [[1, 2]]


def test_the_ui_never_sees_the_passphrase(gated):
    described = gated.describe()
    assert described["tiles"][2][1] == "gate"
    assert PHRASE not in json.dumps(described)
