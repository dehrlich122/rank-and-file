"""The knight (M5.1): a pure knight that jumps in an L. Its abilities, its errors, and the jump's rules."""

import pytest

from conftest import events, make_level
from rankfile import codex
from rankfile.exceptions import (
    GameArgumentError,
    GameError,
    JumpError,
    LockedAbilityError,
    NoBoardError,
    WrongPieceError,
)
from rankfile.pieces import PIECES, Knight, Pawn
from rankfile.repl import NoBoard
from rankfile.runner import run_level
from rankfile.world import KNIGHT_JUMPS

KNIGHT_API = list(Knight.ABILITIES)
PAWN_ONLY = ("move", "turn_left", "turn_right", "facing", "squares_ahead", "capture_left", "capture_right", "bridge")


def knight_level(map_text: str, **overrides):
    return make_level(map_text, piece="knight", api=KNIGHT_API, **overrides)


def stand_in(api: list[str] = KNIGHT_API) -> Knight:
    """Scratch Python's knight: anything that reaches the world says there's no board."""
    return Knight(NoBoard("knight"), api)


@pytest.fixture
def field():
    """Knight on c3, an open 5x5 board: every jump lands on it. The goal on e1."""
    return knight_level(". . . . .\n. . . . .\n. . P . .\n. . . . .\n. . . . G\n")


@pytest.fixture
def ring():
    """Knight on c3, with something different on each landing square:
    a wall (b5), a signpost (d5), a guard's gate (a4), an armoured patrol (e4),
    a pit (a2), a patrol (e2), and floor (b1, d1). The goal on c1."""
    return knight_level(
        ". # . S .\nX . . . .\n. . P . .\nO . . . .\n. . G . .\n",
        legend={"S": {"tile": "sign", "text": "hello"}, "X": {"tile": "gate", "passphrase": "open up"}, "O": "pit"},
        enemies=[{"kind": "patrol", "start": "e2"}, {"kind": "patrol", "start": "e4", "armoured": True}],
    )


# -- the piece -----------------------------------------------------------------------


def test_the_knight_is_a_piece_with_eight_abilities():
    assert PIECES["knight"] is Knight
    assert Knight.NAME == "knight"
    assert Knight.ABILITIES == ("jump", "look", "at_goal", "position", "wait", "read", "pick_up", "inventory")


def test_the_eight_jumps_are_the_l_shapes():
    assert len(set(KNIGHT_JUMPS)) == len(KNIGHT_JUMPS) == 8
    assert all({abs(dx), abs(dy)} == {1, 2} for dx, dy in KNIGHT_JUMPS)


def test_the_jump_entry_explains_the_two_numbers():
    jump = codex.ability_entry(Knight, "jump")
    assert jump.calls == ["knight.jump(dx, dy)"]
    assert [arg["name"] for arg in jump.args] == ["dx", "dy"]
    assert any("`knight.jump(1, 2)` jumps one square right and two up" in paragraph for paragraph in jump.paragraphs)
    assert jump.example == "knight.jump(1, 2)"
    assert codex.ability_entry(Knight, "look").calls == ["knight.look(dx, dy)"]
    assert codex.ability_entry(Knight, "position").calls == ["knight.position"]


@pytest.mark.parametrize("ability", ["jump", "look"])
@pytest.mark.parametrize(
    ("dx", "dy", "words"),
    [
        (1, 1, r"jump\(1, 1\)|look\(1, 1\)"),
        (3, 0, "A knight moves two squares one way and one the other"),
        (0, 0, "A knight moves two squares one way and one the other"),
        ("1", 2, "Numbers don't have quote marks around them"),
        (1.5, 2, r"needs a whole number of squares, like knight\.(jump|look)\(1, 2\), not 1\.5"),
        (1, True, "needs a number of squares"),
    ],
)
def test_an_offset_that_isnt_an_l_is_refused_before_the_world_is_asked(ability, dx, dy, words):
    with pytest.raises(JumpError, match=words) as raised:
        getattr(stand_in(), ability)(dx, dy)  # the stand-in's world would say "no board"
    assert isinstance(raised.value, GameArgumentError)
    assert isinstance(raised.value, TypeError)


def test_an_l_shaped_offset_reaches_the_world():
    with pytest.raises(NoBoardError):
        stand_in().jump(1, 2)
    with pytest.raises(NoBoardError):
        stand_in().look(-2, 1)


def test_a_bad_jump_in_a_run_is_a_friendly_error(field):
    result = run_level(field, "knight.jump(1, 1)")
    assert result.error.type == "JumpError"
    assert "A knight moves two squares one way and one the other" in result.error.friendly
    assert result.final["pos"] == [2, 2]


@pytest.mark.parametrize("name", PAWN_ONLY)
def test_a_pawns_ability_gets_a_kind_answer(name):
    with pytest.raises(WrongPieceError, match="^Knights don't walk: they jump") as raised:
        getattr(stand_in(), name)
    assert isinstance(raised.value, GameError)
    assert isinstance(raised.value, AttributeError)
    assert raised.value.name == name
    assert not hasattr(stand_in(), name)


def test_asking_a_knight_to_walk_in_a_run(field):
    result = run_level(field, "knight.move()")
    assert result.error.type == "WrongPieceError"
    assert result.error.friendly.startswith("Knights don't walk: they jump.")


def test_other_names_are_unchanged():
    with pytest.raises(AttributeError) as made_up:
        stand_in().fly  # noqa: B018
    assert type(made_up.value) is AttributeError
    with pytest.raises(LockedAbilityError):
        stand_in(["jump"]).look  # noqa: B018


def test_the_pawn_has_no_kind_answers():
    assert Pawn.CANT == {}
    with pytest.raises(AttributeError) as raised:
        Pawn(NoBoard("pawn"), ["move"]).jump  # noqa: B018
    assert type(raised.value) is AttributeError


def test_a_knight_shows_where_it_is_but_not_a_facing(field):
    assert run_level(field, "print(knight)").output == "knight at c3\n"


# -- the jump ------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("offset", "via", "facing"),
    [
        ((1, 2), [2, 4], "east"),
        ((-1, 2), [2, 4], "west"),
        ((1, -2), [2, 0], "east"),
        ((-1, -2), [2, 0], "west"),
        ((2, 1), [4, 2], "north"),
        ((2, -1), [4, 2], "south"),
        ((-2, 1), [0, 2], "north"),
        ((-2, -1), [0, 2], "south"),
    ],
)
def test_a_jump_is_one_event_long_leg_first_facing_along_the_short_leg(field, offset, via, facing):
    dx, dy = offset
    result = run_level(field, f"knight.jump({dx}, {dy})")
    assert [event["kind"] for event in events(result)] == ["jump"]
    jump = events(result)[0]
    assert (jump["from"], jump["via"], "took" in jump) == ([2, 2], via, False)
    assert (jump["state"]["pos"], jump["state"]["facing"]) == ([2 + dx, 2 + dy], facing)
    assert result.final["tick"] == 1  # one jump, one action


def test_a_jump_flies_over_walls():
    walled = knight_level(". . . . .\n. # # # .\n. # P # .\n. # # # .\n. . . . G\n")
    result = run_level(walled, "knight.jump(1, 2)")
    assert result.error is None
    assert result.final["pos"] == [3, 4]
    assert result.start["landings"] == sorted([[2 + dx, 2 + dy] for dx, dy in KNIGHT_JUMPS])


def test_a_jump_counts_only_the_square_it_lands_on():
    level = knight_level(". W G\n$ . .\nP . .\n", legend={"W": "waypoint", "$": "gem"})
    result = run_level(level, "knight.jump(1, 2)")  # over the gem on a2 (and a3), onto the waypoint on b3
    assert (result.final["collected"], result.final["crossed"]) == ([], [[1, 2]])


@pytest.mark.parametrize(
    ("code", "error", "friendly", "at"),
    [
        ("knight.jump(-1, 2)", "BlockedError", "Your knight can't land on a wall on b5.", [1, 4]),
        ("knight.jump(1, 2)", "BlockedError", "Your knight can't land on a signpost on d5.", [3, 4]),
        ("knight.jump(2, 1)", "CaptureError", "The patrol on e4 is armoured: it can't be captured.", [4, 3]),
    ],
)
def test_landing_where_it_cant_is_a_bump_and_an_error(ring, code, error, friendly, at):
    result = run_level(ring, code)
    assert (result.error.type, result.error.friendly) == (error, friendly)
    assert [(event["kind"], event["at"]) for event in events(result)] == [("bump", at)]
    assert (result.final["pos"], result.final["tick"]) == ([2, 2], 0)


def test_a_locked_gate_is_the_guards_error(ring):
    result = run_level(ring, "knight.jump(-2, 1)")
    assert result.error.type == "GateLockedError"
    assert [event["kind"] for event in events(result)] == ["bump"]


def test_landing_off_the_board(field):
    result = run_level(field, "knight.jump(2, 1)\nknight.jump(1, 2)")
    assert result.error.type == "BlockedError"
    assert result.error.friendly == "That jump would land off the edge of the board. Your knight is on e4."


def test_a_refused_jump_as_the_first_move_leaves_the_rings_as_they_were(ring):
    result = run_level(ring, "knight.jump(-1, 2)")  # onto a wall: refused, the knight never leaves c3
    assert result.error.type == "BlockedError"
    assert result.final["landings"]
    assert result.final["landings"] == result.start["landings"]


def test_a_refused_jump_off_the_board_leaves_the_rings_where_the_knight_stands(field):
    result = run_level(field, "knight.jump(2, 1)\nknight.jump(1, 2)")  # lands on e4, then tries to leave the board
    assert result.error.type == "BlockedError"
    assert result.final["pos"] == [4, 3]
    assert result.final["landings"]
    assert result.final["landings"] == [[2, 2], [2, 4], [3, 1]]  # the three jumps from e4 that stay on the board
    assert result.final["landings"] != result.start["landings"]


def test_only_the_knight_lands_on_squares():
    assert Knight.LANDS is True
    assert Pawn.LANDS is False


def test_landing_on_an_enemy_takes_it(ring):
    result = run_level(ring, "knight.jump(2, -1)")
    jump = events(result, "jump")[0]
    assert jump["took"] == 0
    assert result.final["enemies"] == [None, [4, 3]]
    assert result.final["pos"] == [4, 1]


def test_landing_in_a_pit_loses_the_run(ring):
    result = run_level(ring, "knight.jump(-2, -1)")
    assert result.status == "lost"
    assert result.final["lost"] == [0, 1]
    assert result.final["landings"] == []  # a lost knight goes nowhere


def test_landing_on_an_attacked_square_loses_the_run():
    level = knight_level(". . . .\nG . . .\n. . . .\n. P . .\n", enemies=[{"kind": "rook", "start": "d4"}])
    assert [3, 1] in level.describe()["start"]["landings"]  # allowed, and deadly: the attacked mark says so
    result = run_level(level, "knight.jump(2, 1)")
    assert result.status == "lost"
    assert result.final["lost"] == [3, 1]


def test_landings_leave_out_only_the_squares_that_are_an_error(ring):
    assert ring.describe()["start"]["landings"] == [[0, 1], [1, 0], [3, 0], [4, 1]]  # pit, floor, floor, patrol


def test_look_names_the_landing_square_for_free(ring):
    offsets = [(-1, 2), (1, 2), (-2, 1), (2, 1), (-2, -1), (2, -1), (-1, -2)]
    result = run_level(ring, f"print([knight.look(dx, dy) for dx, dy in {offsets}])")
    assert result.output == "['wall', 'signpost', 'gate', 'patrol', 'pit', 'patrol', None]\n"
    assert result.final["tick"] == 0


def test_only_knight_levels_carry_landings(corridor, field):
    assert "landings" not in run_level(corridor, "pawn.move()").final
    assert "landings" in field.describe()["start"]
