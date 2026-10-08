"""What the level editor (M4.2) needs from the checker: where each problem is, levels with no lesson,
the board size limit, and the options the editor reads instead of keeping rules of its own."""

from pathlib import Path

import pytest
import yaml

from rankfile import bridge
from rankfile.board import Tile
from rankfile.levels import ENEMY_KEYS, MAX_SIDE, TILE_DETAILS, LevelError, editor_options, parse_level
from rankfile.pieces import PIECES
from rankfile.world import CLOCKS

ROOT = Path(__file__).resolve().parents[2]
LEVEL_FILES = sorted((ROOT / "levels").glob("*/*.yaml"))

MAP = """
. . G
. . .
P . .
"""


def made(**changes):
    """A level the way the editor writes one: no chapter, lesson or trains."""
    data = {"id": "my-test", "title": "Mine", "map": MAP, "api": ["move"]}
    data.update(changes)
    return data


def problem(**changes) -> LevelError:
    with pytest.raises(LevelError) as caught:
        parse_level(made(**changes))
    return caught.value


# -- levels made in the editor --------------------------------------------------------------------


def test_a_level_needs_no_chapter_lesson_or_trains():
    level = parse_level(made())
    assert (level.chapter, level.lesson, level.trains) == (0, "", "")


def test_the_levels_in_the_repo_still_have_a_chapter_a_lesson_and_trains():
    for path in LEVEL_FILES:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        assert isinstance(data.get("chapter"), int), path.name
        assert data.get("lesson"), path.name
        assert str(data.get("trains", "")).strip(), path.name


def test_a_level_still_needs_an_id_a_title_a_map_and_abilities():
    for key in ("id", "title", "map", "api"):
        data = made()
        del data[key]
        with pytest.raises(LevelError, match="missing key"):
            parse_level(data)


# -- where a problem is ------------------------------------------------------------------------------


def test_no_goal_is_a_problem_with_the_goal():
    assert problem(map="""
. . .
P . .
""").at == {"field": "goal"}


def test_an_empty_title_is_a_problem_with_the_title():
    assert problem(title=" ").at == {"field": "title"}


def test_an_ability_the_piece_lacks_is_a_problem_with_the_abilities():
    assert problem(api=["fly"]).at == {"field": "api"}


def test_a_bad_start_is_a_problem_with_the_start():
    assert problem(start={"facing": "up"}).at == {"field": "start"}


def test_a_sign_with_no_text_names_the_squares_that_use_it():
    error = problem(legend={"S": {"tile": "sign", "text": ""}}, map="""
. S G
. . S
P . .
""")
    assert error.at == {"squares": ["b3", "c2"]}


def test_a_timed_gate_that_never_shuts_names_its_squares():
    error = problem(legend={"T": {"tile": "timed_gate", "every": 2, "open": 2}}, map="""
. T G
. . .
P . .
""")
    assert error.at == {"squares": ["b3"]}


def test_an_enemy_on_a_wall_names_the_enemy_and_the_square():
    error = problem(map="""
. # G
. . .
P . .
""", enemies=[{"kind": "rook", "start": "c1"}, {"kind": "chaser", "start": "b3"}])
    assert error.at == {"enemy": 2, "square": "b3"}


def test_an_enemy_on_the_start_square_names_the_enemy():
    assert problem(enemies=[{"kind": "rook", "start": "a1"}]).at == {"enemy": 1}


def test_two_enemies_on_one_square_name_the_second():
    error = problem(enemies=[{"kind": "rook", "start": "c1"}, {"kind": "bishop", "start": "c1"}])
    assert error.at == {"enemy": 2}


def test_a_crooked_route_names_its_enemy():
    error = problem(enemies=[{"kind": "patrol", "route": ["b2", "c3"]}])
    assert error.at == {"enemy": 1}


def test_a_start_square_under_attack_names_the_square_and_the_attacker():
    error = problem(enemies=[{"kind": "rook", "start": "a3"}])
    assert error.at == {"square": "a1", "enemy": 1}


def test_a_problem_in_another_board_is_a_problem_with_the_variants():
    error = problem(variants=[{"map": "G .\n. .\n"}])
    assert error.at == {"field": "variants"}


def test_a_problem_in_a_constraint_is_a_problem_with_the_constraints():
    assert problem(constraints={"max_numbers": 0}).at == {"field": "constraints"}


def test_the_message_is_the_same_wherever_the_problem_is():
    assert str(problem(enemies=[{"kind": "rook", "start": "a1"}])) == "enemy 1: starts on the pawn's square"


def test_the_bridge_reports_where_the_problem_is():
    import json

    result = json.loads(bridge.load_level(json.dumps(made(api=["fly"]))))
    assert result["ok"] is False and result["at"] == {"field": "api"}
    assert json.loads(bridge.load_level(json.dumps(made())))["ok"] is True


# -- the size limit ----------------------------------------------------------------------------------


def square_map(width: int, height: int) -> str:
    rows = [" ".join("." for _ in range(width)) for _ in range(height)]
    rows[0] = "G " + rows[0][2:]
    rows[-1] = "P " + rows[-1][2:]
    return "\n".join(rows)


def test_a_board_may_be_as_big_as_the_limit():
    assert parse_level(made(map=square_map(MAX_SIDE, MAX_SIDE))).board.width == MAX_SIDE


@pytest.mark.parametrize("width, height", [(MAX_SIDE + 1, 4), (4, MAX_SIDE + 1)])
def test_a_bigger_board_is_a_problem_with_the_size(width, height):
    assert problem(map=square_map(width, height)).at == {"field": "size"}


def test_every_level_in_the_repo_fits_the_limit():
    for path in LEVEL_FILES:
        level = parse_level(yaml.safe_load(path.read_text(encoding="utf-8")))
        for case in level.cases() or [level]:
            board = getattr(case, "level", case).board
            assert max(board.width, board.height) <= MAX_SIDE, path.name


# -- the editor's options ----------------------------------------------------------------------------


def test_the_options_come_from_the_checkers_own_tables():
    options = editor_options()
    assert options["max_side"] == MAX_SIDE
    assert options["pieces"] == {name: list(piece.ABILITIES) for name, piece in PIECES.items()}
    assert set(options["tiles"]) == {tile.value for tile in Tile}
    assert set(options["enemies"]) == set(ENEMY_KEYS)
    assert options["clocks"] == list(CLOCKS)
    assert options["facings"] == ["north", "east", "south", "west"]


def test_each_tile_lists_the_details_it_needs_and_may_take():
    tiles = editor_options()["tiles"]
    assert tiles["floor"] == {"needs": [], "may": []}
    for tile, (needs, may) in TILE_DETAILS.items():
        assert tiles[tile.value] == {"needs": sorted(needs), "may": sorted(may)}


def test_the_bridge_sends_the_options_as_json():
    import json

    assert json.loads(bridge.editor_options()) == json.loads(json.dumps(editor_options()))
