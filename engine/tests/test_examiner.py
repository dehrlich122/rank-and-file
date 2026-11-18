"""M5.2's examiner, as a level file gives it (M5.2-4a): reading and checking `examine`, one case per call, what the
player is told about it. (Making the calls is M5.2-4b.)"""

import json
import sys
from pathlib import Path

import pytest

from conftest import make_level
from rankfile.levels import NOT_JUDGED, Examine, ExamineCall, LevelError, parse_level
from rankfile.runner import run_level

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "scripts"))
import show_level  # noqa: E402  (the script, which has to be found first)

ROW = "P . . G\n"
OTHER = "P . G\n"
THIRD = "P G\n"
API = ["move", "turn_left", "at_goal"]


def examiner(*calls, function="gallop", **overrides):
    return make_level(ROW, api=API, examine={"function": function, "calls": list(calls)}, **overrides)


def boards(*maps):
    return {"variants": [{"map": text} for text in maps]}


def test_an_examiner_is_read_with_its_calls():
    level = examiner({"args": [1, 3], "board": 1}, {"args": [-1], "returns": 4}, {"args": ["a", 2.5, True, None]}, {})
    assert level.examine.function == "gallop"
    assert [(call.args, call.board) for call in level.examine.calls] == [([1, 3], 1), ([-1], 1), (["a", 2.5, True, None], 1), ([], 1)]
    assert [call.returns for call in level.examine.calls][1] == 4
    assert isinstance(level.examine, Examine) and all(isinstance(call, ExamineCall) for call in level.examine.calls)


def test_a_missing_returns_is_not_judged_and_returns_null_wants_none():
    level = examiner({"args": [1]}, {"args": [2], "returns": None}, {"args": [3], "returns": 0}, {"args": [4], "returns": False})
    answers = [call.returns for call in level.examine.calls]
    assert answers[0] is NOT_JUDGED
    assert answers[1] is None
    assert answers[2] == 0 and answers[2] is not NOT_JUDGED
    assert answers[3] is False


def test_a_level_with_no_examiner_has_none():
    assert make_level(ROW).examine is None


@pytest.mark.parametrize(
    ("examine", "message"),
    [
        ([], "examine must be a mapping"),
        (None, "examine must be a mapping"),
        ({"function": "gallop", "calls": [{}], "extra": 1}, "unknown examine key"),
        ({"calls": [{}]}, "examine needs a function"),
        ({"function": 3, "calls": [{}]}, "isn't a name Python can use"),
        ({"function": "two words", "calls": [{}]}, "isn't a name Python can use"),
        ({"function": "for", "calls": [{}]}, "is a Python keyword"),
        ({"function": "print", "calls": [{}]}, "name of a Python built-in"),
        ({"function": "gallop"}, "examine needs calls"),
        ({"function": "gallop", "calls": {"args": []}}, "examine needs calls"),
        ({"function": "gallop", "calls": []}, "examine needs calls"),
        ({"function": "gallop", "calls": [{}] * 7}, "at most 6 calls"),
        ({"function": "gallop", "calls": [{}, 3]}, "examine call 2 must be a mapping"),
        ({"function": "gallop", "calls": [{"arg": [1]}]}, "unknown key(s) in examine call 1: arg"),
        ({"function": "gallop", "calls": [{"args": 3}]}, "examine call 1: args must be a list"),
        ({"function": "gallop", "calls": [{"args": [[1]]}]}, "each arg must be a plain value"),
        ({"function": "gallop", "calls": [{"args": [{"a": 1}]}]}, "each arg must be a plain value"),
        ({"function": "gallop", "calls": [{"args": [float("inf")]}]}, "each arg must be a plain value"),
        ({"function": "gallop", "calls": [{"returns": [1, 2]}]}, "returns must be a plain value"),
        ({"function": "gallop", "calls": [{"returns": {"a": 1}}]}, "returns must be a plain value"),
        ({"function": "gallop", "calls": [{"board": 0}]}, "board must be a whole number of at least 1"),
        ({"function": "gallop", "calls": [{"board": "1"}]}, "board must be a whole number of at least 1"),
        ({"function": "gallop", "calls": [{"board": True}]}, "board must be a whole number of at least 1"),
        ({"function": "gallop", "calls": [{"board": 1.5}]}, "board must be a whole number of at least 1"),
        ({"function": "gallop", "calls": [{"board": 2}]}, "examine call 1 is on board 2, but the level has only 1 board"),
    ],
)
def test_a_bad_examiner_is_refused_where_it_is_wrong(examine, message):
    with pytest.raises(LevelError, match=message.replace("(", r"\(").replace(")", r"\)")) as raised:
        make_level(ROW, api=API, examine=examine)
    assert raised.value.at == {"field": "examine"}


def test_a_call_to_a_board_that_is_not_there_names_the_boards_there_are():
    with pytest.raises(LevelError, match="examine call 2 is on board 3, but the level has only 2 boards") as raised:
        examiner({"board": 1}, {"board": 3}, {"board": 2}, **boards(OTHER))
    assert raised.value.at == {"field": "examine"}


def test_a_board_no_call_uses_is_refused():
    with pytest.raises(LevelError, match="no call is made on board 2") as raised:
        examiner({"args": [1]}, {"args": [2]}, **boards(OTHER))
    assert raised.value.at == {"field": "examine"}
    with pytest.raises(LevelError, match="no call is made on board 1"):
        examiner({"board": 2}, **boards(OTHER))


def test_an_examiner_with_hidden_goal_squares_is_refused():
    with pytest.raises(LevelError, match=r"can't also have \? squares") as raised:
        make_level("P . ?\n", api=API, examine={"function": "gallop", "calls": [{}]})
    assert raised.value.at == {"field": "examine"}


def test_the_most_calls_is_the_most_boards():
    assert len(examiner(*[{}] * 6).examine.calls) == 6


def test_the_examiner_function_is_checked_like_a_rules_function():
    with pytest.raises(LevelError, match="constraint functions: 'print' is the name of a Python built-in"):
        make_level(ROW, api=API, constraints={"functions": {"print": {}}})


def test_each_call_is_a_case_in_the_files_order_and_labelled_with_its_text():
    level = examiner({"args": [1, 3]}, {"args": ["up"]}, {"args": []})
    cases = level.cases()
    assert [case.label for case in cases] == ["gallop(1, 3)", "gallop('up')", "gallop()"]
    assert [case.call for case in cases] == level.examine.calls
    assert [case.where for case in cases] == [
        "where the examiner called gallop(1, 3)",
        "where the examiner called gallop('up')",
        "where the examiner called gallop()",
    ]


def test_a_case_is_on_its_calls_board_and_carries_the_examiner():
    level = examiner({"args": [1], "board": 2}, {"args": [2], "board": 1}, {"args": [3], "board": 3}, {"args": [4], "board": 2}, **boards(OTHER, THIRD))
    cases = level.cases()
    assert [case.label for case in cases] == ["gallop(1)", "gallop(2)", "gallop(3)", "gallop(4)"]
    assert [case.level.board.width for case in cases] == [3, 4, 2, 3]  # two calls on board 2: two cases on it
    assert [case.where for case in cases][0] == "where the examiner called gallop(1) on board 2"
    for case in cases:
        assert case.level.variants == []
        assert case.level.examine is level.examine
        assert case.level.goal == (case.level.board.width - 1, 0)


def test_asking_a_case_for_its_cases_is_harmless():
    level = examiner({"args": [1]}, {"args": [2], "board": 2}, **boards(OTHER))
    for case in level.cases():
        [again] = case.level.cases()
        assert (again.label, again.where, again.call) == (case.label, case.where.split(" on board")[0], case.call)
        assert again.level is case.level
        assert case.level.describe()["boards"] == []


def test_other_maps_do_not_carry_the_examiner_and_the_levels_own_stay_whole():
    level = examiner({"board": 1}, {"board": 2}, **boards(OTHER))
    assert level.variants[0].examine is None
    assert level.variants[0].variants == []
    assert len(level.variants) == 1


def test_the_calls_are_counted_in_the_runners_words():
    assert examiner({}, {}, {}).case_words == ("The examiner's calls", "calls")
    assert make_level(ROW).case_words == ("Boards", "boards")


def test_the_goals_say_how_often_the_examiner_calls():
    level = examiner({"args": [1]}, {"args": [2]}, {"args": [3]})
    assert level.goals() == [
        "Reach the goal on d1.",
        "The examiner calls gallop 3 times, each call on a fresh board, and every call has to meet the goals above.",
    ]
    assert examiner({}).goals()[-1] == "The examiner calls gallop 1 time, each call on a fresh board, and every call has to meet the goals above."
    assert not any("work on all" in goal for goal in examiner({}, {"board": 2}, **boards(OTHER)).goals())


def test_the_goals_say_when_an_answer_is_wanted_but_never_what_it_is():
    level = examiner({"args": [1]}, {"args": [2], "returns": 7351})
    assert level.goals()[-1] == "gallop also has to hand back the answer the examiner wants."
    assert "7351" not in json.dumps(level.goals())
    assert len(examiner({"args": [1], "returns": None}).goals()) == 3  # None is an answer too


def test_a_level_with_other_maps_and_no_examiner_still_says_so():
    level = make_level(ROW, **boards(OTHER))
    assert level.goals()[-1] == "Your code has to work on all 2 boards."
    assert [case.label for case in level.cases()] == ["board 1", "board 2"]


def test_describe_lists_the_calls_in_order_and_no_answer_anywhere():
    level = examiner({"args": [1, 3], "board": 1}, {"args": [-1], "board": 2, "returns": 8675309}, {"args": [], "board": 1, "returns": "secret-word"}, **boards(OTHER))
    described = level.describe()
    assert described["examine"] == {
        "function": "gallop",
        "calls": [{"text": "gallop(1, 3)", "board": 1}, {"text": "gallop(-1)", "board": 2}, {"text": "gallop()", "board": 1}],
    }
    text = json.dumps(described)
    assert "8675309" not in text and "secret-word" not in text
    assert [board["width"] for board in described["boards"]] == [4, 3]
    assert all(board["examine"] is None for board in described["boards"])
    assert make_level(ROW).describe()["examine"] is None


def test_a_level_with_one_board_has_no_boards_row_even_with_calls():
    assert examiner({}, {}).describe()["boards"] == []


def test_a_run_that_only_defines_has_one_recorded_case_per_call():
    level = examiner({"args": [1]}, {"args": [2], "board": 2}, {"args": [3]}, **boards(OTHER))
    result = run_level(level, "def gallop(n):\n    pass\n").to_dict()
    assert [case["label"] for case in result["cases"]] == ["gallop(1)", "gallop(2)", "gallop(3)"]
    assert result["case_note"].startswith("It worked for ")
    assert result["case_note"].endswith(" calls.")
    assert all(case["level"]["examine"]["function"] == "gallop" for case in result["cases"])
    assert result["case_note"] != "" and result["case"] in (0, 1, 2)


def test_the_runners_note_names_the_call_it_shows():
    level = examiner({"args": [1]}, {"args": [2]})
    result = run_level(level, "def gallop(n):\n    pass\n")
    assert [case["case_note"] for case in result.cases] == [
        "This run is the one where the examiner called gallop(1).",
        "This run is the one where the examiner called gallop(2).",
    ]


def test_show_level_hides_what_a_call_wants_and_keeps_the_rule_that_one_is_wanted():
    data = {
        "constraints": {"functions": {"gallop": {"params": 2, "returns": True}}},
        "examine": {"function": "gallop", "calls": [{"args": [1, 3]}, {"args": [-1], "returns": 4}, {"args": [], "returns": None}]},
        "hints": ["a", "b"],
    }
    shown = show_level.redact(data)
    assert shown["constraints"]["functions"]["gallop"] == {"params": 2, "returns": True}
    assert shown["examine"]["calls"] == [{"args": [1, 3]}, {"args": [-1], "returns": "<answer hidden>"}, {"args": [], "returns": "<answer hidden>"}]
    assert shown["examine"]["function"] == "gallop"
    assert shown["hints"] == "<2 hints hidden>"
    assert "4" not in json.dumps(shown["examine"]["calls"][1]["returns"])
    assert data["examine"]["calls"][1]["returns"] == 4  # the data itself is untouched


def test_show_level_copes_with_an_examiner_it_cannot_make_sense_of():
    assert show_level.redact({"examine": {"calls": "no"}}) == {"examine": {"calls": "no"}}
    assert show_level.redact({"examine": {"function": "f"}}) == {"examine": {"function": "f"}}
    assert show_level.redact({"examine": {"calls": [3, {"returns": 5}]}}) == {"examine": {"calls": [3, {"returns": "<answer hidden>"}]}}
    assert show_level.redact({"examine": 3}) == {"examine": 3}


def test_parse_level_accepts_the_key_in_a_whole_file():
    level = parse_level({
        "id": "t", "title": "T", "api": API, "map": ROW, "examine": {"function": "gallop", "calls": [{"args": [1]}]},
    })  # fmt: skip
    assert level.examine.function == "gallop"
