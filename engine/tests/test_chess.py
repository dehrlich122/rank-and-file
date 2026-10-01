"""M3.4: looking ahead (pawn.look), and still enemy chess pieces whose attacked squares are deadly."""

import pytest

from conftest import make_level
from rankfile.levels import LevelError
from rankfile.runner import run_level
from rankfile.world import World

API = ["move", "turn_left", "turn_right", "wait", "look", "capture_left", "capture_right", "bridge"]
LEGEND = {
    "O": "pit",
    "$": "gem",
    "L": "plank",
    "W": "waypoint",
    "S": {"tile": "sign", "text": "Hello"},
    "X": {"tile": "gate", "passphrase": "open"},
    "T": {"tile": "timed_gate", "every": 3},
}


def said(level, code: str) -> list[str]:
    result = run_level(level, code)
    return result.output.splitlines()


# -- look() ------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "ahead, word",
    [
        (".", "None"),
        ("#", "wall"),
        ("O", "pit"),
        ("$", "gem"),
        ("L", "plank"),
        ("S", "signpost"),
        ("X", "gate"),
        ("T", "portcullis"),
        ("W", "None"),  # a waypoint is only passed over
    ],
)
def test_look_names_what_is_straight_ahead(ahead, word):
    level = make_level(f"{ahead} G\nP .\n", api=API, legend=LEGEND)
    assert said(level, "print(pawn.look())") == [word]


def test_look_sees_the_edge_of_the_board_but_not_the_goal():
    level = make_level("G .\nP .\n", api=API, start={"facing": "west"})
    assert said(level, "print(pawn.look())\npawn.turn_right()\nprint(pawn.look())") == ["edge", "None"]


def test_look_left_and_right_see_the_squares_diagonally_ahead():
    enemies = [{"kind": "patrol", "start": "a3"}]
    level = make_level(". . #\n. P .\nG . .\n", api=API, enemies=enemies)
    assert said(level, 'print(pawn.look("left"))\nprint(pawn.look("right"))\nprint(pawn.look())') == ["patrol", "wall", "None"]


def test_things_that_go_away_look_empty_afterwards():
    level = make_level("G\nX\n$\n.\nO\nP\n", api=API, legend=LEGEND, start={"planks": 1})
    code = (
        "pawn.bridge()\nprint(pawn.look())\n"  # a bridged pit is floor
        "pawn.move(2)\nprint(pawn.look())\n"  # the gem, before it's picked up
        "pawn.move()\nprint('open')\nprint(pawn.look())\n"  # an opened gate
    )
    assert said(level, code) == ["None", "gem", "open", "None"]


def test_looking_is_free_and_locked_until_unlocked():
    level = make_level("G\n.\nP\n", api=API)
    result = run_level(level, 'pawn.look()\npawn.look("left")\npawn.move(2)')
    assert result.status == "solved" and result.final["tick"] == 2
    locked = run_level(make_level("G\nP\n"), "pawn.look()")
    assert locked.status == "error" and locked.error.type == "LockedAbilityError"


def test_look_only_takes_left_or_right():
    result = run_level(make_level("G\nP\n", api=API), 'pawn.look("up")')
    assert result.status == "error"
    assert result.summary == 'look() takes "left" or "right", or nothing to look straight ahead, not \'up\'.'


# -- rooks and bishops ---------------------------------------------------------------------

FIELD = ". . . . G\n. . . . .\n. . . . .\n. . . . .\n. P . . .\n"  # 5x5, the pawn on b1; pieces go on c3


def rook_level(map_text: str = FIELD, **overrides):
    return make_level(map_text, api=API, enemies=[{"kind": "rook", "start": "c3"}], **overrides)


def squares(names: str) -> set[tuple[int, int]]:
    return {(ord(name[0]) - ord("a"), int(name[1:]) - 1) for name in names.split()}


def test_a_rook_attacks_its_rank_and_file():
    assert World(rook_level()).attacked() == squares("a3 b3 d3 e3 c1 c2 c4 c5")


def test_stepping_onto_an_attacked_square_loses_the_run():
    result = run_level(rook_level(), "pawn.move(2)")
    assert result.status == "lost"
    assert result.summary == "The rook on c3 took your pawn on b3."
    assert result.final["pos"] == [1, 2] and result.final["lost"] == [1, 2]


def test_a_rook_taken_from_the_diagonal_attacks_nothing_more():
    result = run_level(rook_level(), "pawn.move()\npawn.capture_right()\npawn.move(2)\npawn.turn_right()\npawn.move(2)")
    assert result.status == "solved"
    assert result.final["enemies"] == [None] and result.final["attacked"] == []


def test_a_bishop_attacks_its_diagonals_so_it_cannot_be_approached_that_way():
    level = make_level(FIELD, api=API, enemies=[{"kind": "bishop", "start": "c3"}])
    assert World(level).attacked() == squares("b2 a1 d4 e5 b4 a5 d2 e1")
    result = run_level(level, "pawn.move()")
    assert result.status == "lost" and result.summary == "The bishop on c3 took your pawn on b2."


def test_walls_closed_gates_and_pieces_stop_a_line():
    level = make_level(
        ". . . . G\n. . . . .\n# . . X .\n. . . . .\n. P . . .\n",
        api=API,
        legend=LEGEND,
        enemies=[{"kind": "rook", "start": "c3"}, {"kind": "patrol", "start": "c5"}],
    )
    world = World(level)
    # The wall on a3 and the gate on d3 stop the rank; the patrol on c5 is attacked, and ends the file.
    assert world.attacked() == squares("b3 c1 c2 c4 c5")
    world.opened.add((3, 2))
    assert world.attacked() == squares("b3 d3 e3 c1 c2 c4 c5")


def test_a_level_cannot_start_the_pawn_where_a_piece_attacks():
    with pytest.raises(LevelError, match="the pawn starts on b1, which the rook on b4 attacks"):
        make_level(". G\n. .\n. .\n. .\n. P\n", api=API, enemies=[{"kind": "rook", "start": "b4"}])


def test_the_state_lists_attacked_squares_only_where_there_are_chess_pieces():
    assert "attacked" in World(rook_level()).state()
    assert "attacked" not in World(make_level("G\nP\n")).state()


def test_the_challenge_panel_words_a_chess_pieces_rule():
    obstacles = rook_level().obstacles()
    assert obstacles[0].startswith("A rook stands on c3. It attacks every square along its rank and file")
    assert obstacles[-1] == "If you walk into an enemy, you're caught and the run is lost."


def test_an_armoured_rook_cannot_be_taken():
    level = make_level(FIELD, api=API, enemies=[{"kind": "rook", "start": "c3", "armoured": True}])
    result = run_level(level, "pawn.move()\npawn.capture_right()")
    assert result.status == "error" and result.error.type == "CaptureError"


def test_look_names_a_chess_piece():
    assert said(rook_level(), 'pawn.move()\nprint(pawn.look("right"))') == ["rook"]


def test_chess_pieces_take_only_their_own_keys():
    with pytest.raises(LevelError, match="a rook doesn't take route"):
        make_level(FIELD, api=API, enemies=[{"kind": "rook", "start": "c3", "route": ["c3", "c4"]}])
