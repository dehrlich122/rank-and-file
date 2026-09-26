import pytest

from conftest import basics, make_level
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
    assert basics(described["start"]) == {"pos": [0, 0], "facing": "east", "opened": []}
    assert described["goal"] == [1, 1]
    assert described["signs"] == [{"pos": [0, 1], "text": "hi"}]
    assert described["hints"] == []
    assert make_level("P G\n", hints=["a nudge", "a reminder"]).describe()["hints"] == ["a nudge", "a reminder"]
    assert described["par"] == {"lines": None}
    assert make_level("P G\n", par={"lines": 2}).describe()["par"] == {"lines": 2}


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"map": ". .\n. .\n"}, "start square"),
        ({"map": "P P G\n"}, "more than one start"),
        ({"map": "P G\n. . .\n"}, "same number of squares"),
        ({"map": "P G @\n"}, "'@'"),
        ({"map": "P G ?\n"}, "not both"),
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
        ({"par": {"moves": 3}}, "unknown par"),
        ({"par": {"lines": 0}}, "par lines"),
        ({"par": {"lines": "3"}}, "par lines"),
        ({"par": 3}, "par must be a mapping"),
        ({"variants": {"map": "P G\n"}}, "variants must be a list"),
        ({"variants": [{"map": "P G\n", "goal": 1}]}, "variant 1 must have a map"),
        ({"variants": [{"map": "P G\n"}, {"map": "G .\n"}]}, "variant 2: the map needs a start"),
        ({"variants": [{"map": "P .\n"}]}, "variant 1: objective reach_goal needs a goal"),
    ],
)
def test_bad_levels_fail_loudly(overrides, message):
    with pytest.raises(LevelError, match=message):
        make_level("P G\n", **overrides)


def test_missing_required_keys():
    with pytest.raises(LevelError, match="missing key"):
        parse_level({"id": "x"})


def test_describe_puts_goals_and_rules_into_words():
    level = make_level(
        "G X\nP .\n",
        legend={"X": {"tile": "gate", "passphrase": "secret"}},
        constraints={"max_lines": 2, "min_comments": 1, "require_nodes": ["For"], "ban_nodes": ["While"]},
    )
    described = level.describe()
    assert described["goals"] == ["Reach the goal on a2.", "Get past the locked gate on b2. A guard keeps it shut."]
    assert described["rules"] == [
        "At most 2 lines of code. Blank lines and comments don't count.",
        "At least 1 comment (a note starting with #).",
        "Must use a for loop.",
        "Not allowed: a while loop.",
    ]
    assert described["stars"] == ["Solve the level.", "There's no par here: solving is enough.", "Solve it without opening a hint."]
    assert make_level("P G\n", par={"lines": 1}).star_goals()[1] == "Use 1 line of code or fewer (par)."


def test_a_hidden_goal_is_one_case_per_question_mark():
    level = make_level("? . ?\nP . .\n", start={"facing": "east"})
    assert level.goal is None
    assert level.goal_spots == [(0, 1), (2, 1)]
    assert [(case.label, case.level.goal) for case in level.cases()] == [("a2", (0, 1)), ("c2", (2, 1))]
    described = level.describe()
    assert (described["goal"], described["goal_spots"], described["case_title"]) == (None, [[0, 1], [2, 1]], "Where the goal was")
    assert described["goals"][0].startswith("Reach the goal. It's hidden on one of the 2 squares marked ?.")
    assert make_level("P G\n").describe()["case_title"] == ""  # one case: no row of cases
    with pytest.raises(LevelError, match="not both"):
        make_level("P ?\n", variants=[{"map": "P G\n"}])


def test_other_maps_share_the_level_but_not_its_map():
    level = make_level("P . G\n", variants=[{"map": "P G .\n"}], api=["move", "at_goal"])
    [other] = level.variants
    assert (other.goal, other.api, other.variants) == ((1, 0), ["move", "at_goal"], [])
    assert [case.label for case in level.cases()] == ["your board", "board 2"]
    assert level.describe()["goals"][-1] == "Your code is also checked on 1 other board."
    with pytest.raises(LevelError, match="only for the level's own map"):
        make_level("P . G\n", variants=[{"map": "P ? .\n"}])


def test_say_goals_point_to_the_sign_when_the_phrase_is_written_there():
    on_sign = make_level("S G\nP .\n", legend={"S": {"tile": "sign", "text": "Say: hello"}}, objectives=["reach_goal", {"say": "hello"}])
    assert on_sign.goals()[1] == "Say the phrase from the signpost: print it, exactly as written."
    plain = make_level("G\nP\n", objectives=[{"say": "hello"}])
    assert plain.goals() == ['Say "hello" (print it).']


def test_sandbox_is_open_with_no_objectives():
    level = sandbox_level(["move"])
    assert level.goal is None
    assert not level.objectives.reach_goal
    assert level.board.tiles == {}
