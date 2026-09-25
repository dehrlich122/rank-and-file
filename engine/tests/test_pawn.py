from conftest import make_level

from rankfile.runner import run_level


def events(result):
    return [event for step in result.steps for event in step["events"]]


def test_move_with_an_argument_emits_one_event_per_square(corridor):
    result = run_level(corridor, "pawn.move(3)")
    assert result.status == "solved"
    moves = events(result)
    assert [e["kind"] for e in moves] == ["move", "move", "move"]
    assert [e["state"]["pos"] for e in moves] == [[1, 1], [1, 2], [1, 3]]
    assert result.final == {"pos": [1, 3], "facing": "north"}


def test_turns_change_facing_but_not_position(corridor):
    result = run_level(corridor, "pawn.turn_left()\npawn.turn_left()\npawn.turn_right()")
    assert [e["state"]["facing"] for e in events(result)] == ["west", "south", "west"]
    assert result.final["pos"] == [1, 0]


def test_walls_stop_the_pawn_with_a_bump(corridor):
    result = run_level(corridor, "pawn.turn_right()\npawn.move()")
    assert result.status == "error"
    assert result.error.type == "BlockedError"
    assert "wall on c1" in result.error.friendly
    assert events(result)[-1] == {"kind": "bump", "state": {"pos": [1, 0], "facing": "east"}, "at": [2, 0]}


def test_the_edge_of_the_board_stops_the_pawn():
    level = make_level("G\nP\n")
    result = run_level(level, "pawn.move(2)")
    assert result.status == "error"
    assert "edge of the board" in result.error.friendly
    assert result.final["pos"] == [0, 1]  # it got as far as it could


def test_signposts_block_movement():
    level = make_level("S G\nP .\n", legend={"S": {"tile": "sign", "text": "hi"}})
    result = run_level(level, "pawn.move()")
    assert "signpost" in result.error.friendly


def test_locked_abilities_explain_themselves(corridor):
    level = make_level("G\nP\n", api=["move"])
    result = run_level(level, "pawn.turn_left()")
    assert result.error.type == "LockedAbilityError"
    assert result.error.friendly == "Your pawn hasn't learned `turn_left` yet. In this level it knows: move."


def test_locked_abilities_are_hidden_from_dir():
    level = make_level("G\nP\n", api=["move"])
    result = run_level(level, "print(dir(pawn))\nprint(hasattr(pawn, 'turn_left'))")
    assert result.output == "['move']\nFalse\n"


def test_the_pawn_cannot_be_teleported(corridor):
    result = run_level(corridor, "pawn.position = (1, 3)")
    assert result.status == "error"
    assert "can't change the pawn's `position`" in result.error.friendly


def test_position_and_facing_properties():
    level = make_level("G\nP\n", api=["move", "position", "facing"])
    result = run_level(level, "print(pawn.position, pawn.facing)\npawn.move()\nprint(pawn.position)")
    assert result.output == "(0, 0) north\n(0, 1)\n"


def test_repr_describes_the_pawn(corridor):
    result = run_level(corridor, "print(pawn)")
    assert result.output == "pawn at b1 facing north\n"


def test_bad_arguments_to_move(corridor):
    cases = {
        'pawn.move("2")': "text '2'",
        "pawn.move(2.5)": "whole number",
        "pawn.move(0)": "at least 1",
        "pawn.move(True)": "not True",
        "pawn.move([1])": "not [1]",
    }
    for code, fragment in cases.items():
        result = run_level(corridor, code)
        assert result.status == "error", code
        assert fragment in result.error.friendly, code
