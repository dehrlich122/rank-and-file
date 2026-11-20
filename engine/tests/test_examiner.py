"""M5.2's examiner, as a level file gives it (M5.2-4a): reading and checking `examine`, one case per call, what the
player is told about it. (Making the calls is M5.2-4b.)"""

import json
import sys
from pathlib import Path

import pytest

from conftest import make_level
from rankfile import bridge
from rankfile.levels import NOT_JUDGED, Examine, ExamineCall, LevelError, parse_level
from rankfile.runner import examiner_line, execute, parse_snippet_call, run_level, run_sandbox
from rankfile.tracer import PLAYER_FILENAME

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
        ({"function": "gallop", "calls": [{"args": [{"a": 1}]}]}, "examine call 1: arg 1 is a mapping, and the only mapping allowed is"),
        ({"function": "gallop", "calls": [{"args": [1, float("inf")]}]}, "examine call 1: arg 2 must be a plain value"),
        ({"function": "gallop", "calls": [{"returns": float("nan")}]}, "examine call 1: returns must be a plain value"),
        ({"function": "gallop", "calls": [{"returns": {"a": 1}}]}, "examine call 1: returns is a mapping, and the only mapping allowed"),
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


# -- M5.3-4: lists and pairs, in the file and in what the examiner says ---------------------------------------------

def test_a_list_a_list_of_pairs_and_a_tuple_are_read_as_python_holds_them():
    level = examiner(
        {"args": [[1, -1, 1]], "returns": [4, 9]},
        {"args": [[[2, 1], [3, 3]], 5], "returns": [[0, 1], [2, 3]]},
        {"args": [{"tuple": [1, "a"]}], "returns": {"tuple": [4, 9]}},
        {"args": [[]], "returns": []},
        {"args": [["a", True, None, 2.5]], "returns": [[1]]},
    )
    calls = level.examine.calls
    assert [call.args for call in calls] == [[[1, -1, 1]], [[(2, 1), (3, 3)], 5], [(1, "a")], [[]], [["a", True, None, 2.5]]]
    assert [call.returns for call in calls] == [[4, 9], [(0, 1), (2, 3)], (4, 9), [], [(1,)]]
    assert [type(call.args[0]) for call in calls] == [list, list, tuple, list, list]
    assert type(calls[0].returns) is list and type(calls[2].returns) is tuple
    assert all(type(item) is tuple for item in calls[1].args[0] + calls[1].returns)


def test_an_empty_list_is_allowed_and_a_pair_needs_a_value():
    assert examiner({"args": [[], [[1, 2]]], "returns": []}).examine.calls[0].args == [[], [(1, 2)]]
    with pytest.raises(LevelError, match="a pair"):
        examiner({"args": [[[]]]})


def test_a_call_reads_as_python_prints_it():
    call = examiner({"args": [[1, -1], [[2, 1], [3, 3]], {"tuple": [4, 9]}, [], "up", None]}).examine.calls[0]
    assert call.text("visit") == "visit([1, -1], [(2, 1), (3, 3)], (4, 9), [], 'up', None)"
    assert examiner({"args": [{"tuple": [4]}]}).examine.calls[0].text("visit") == "visit((4,))"
    assert examiner({"args": [[[7]]]}).examine.calls[0].text("visit") == "visit([(7,)])"


def test_the_label_and_describe_carry_the_text_and_no_answer():
    level = examiner({"args": [[[2, 1], [3, 3]]], "returns": [[777, 888]]}, {"args": [[5, 6]], "returns": {"tuple": [31337, 0]}})
    assert [case.label for case in level.cases()] == ["gallop([(2, 1), (3, 3)])", "gallop([5, 6])"]
    described = json.dumps(level.describe())
    assert "gallop([(2, 1), (3, 3)])" in described and "gallop([5, 6])" in described
    assert "777" not in described and "31337" not in described


@pytest.mark.parametrize(
    ("call", "message"),
    [
        ({"args": [[[1, [2]]]]}, "examine call 1: arg 1: a pair .a list inside the list. must hold at least one plain value, with no list, pair or mapping inside it"),
        ({"args": [[[1, [2, 3]], [4, 5]]]}, "examine call 1: arg 1: a pair"),  # a pair inside a pair
        ({"args": [[[[1]]]]}, "examine call 1: arg 1: a pair"),  # a list three deep
        ({"args": [[[1, {"tuple": [2]}]]]}, "examine call 1: arg 1: a pair"),
        ({"args": [1, [[]]]}, "examine call 1: arg 2: a pair"),  # an empty pair
        ({"args": [[{"tuple": [1, 2]}]]}, "examine call 1: arg 1: inside a list a tuple is written as an inner list"),
        ({"args": [[{"a": 1}]]}, "examine call 1: arg 1: inside a list a tuple is written as an inner list"),
        ({"args": [{"tuple": [1], "x": 2}]}, "examine call 1: arg 1 is a mapping, and the only mapping allowed is"),
        ({"args": [{"tuples": [1]}]}, "examine call 1: arg 1 is a mapping, and the only mapping allowed is"),
        ({"args": [{}]}, "examine call 1: arg 1 is a mapping, and the only mapping allowed is"),
        ({"args": [{"tuple": [[1, 2]]}]}, "examine call 1: arg 1: .tuple: .... must hold a list of at least one plain value"),  # a list inside a tuple
        ({"args": [{"tuple": [{"tuple": [1]}]}]}, "examine call 1: arg 1: .tuple: .... must hold a list"),
        ({"args": [{"tuple": []}]}, "examine call 1: arg 1: .tuple: .... must hold a list of at least one plain value"),
        ({"args": [{"tuple": None}]}, "examine call 1: arg 1: .tuple: .... must hold a list of at least one plain value"),
        ({"args": [{"tuple": 5}]}, "examine call 1: arg 1: .tuple: .... must hold a list of at least one plain value"),
        ({"args": [[1, float("nan")]]}, "examine call 1: arg 1 must be a plain value"),
        ({"returns": [[1, [2]]]}, "examine call 1: returns: a pair"),
        ({"returns": [[[1]]]}, "examine call 1: returns: a pair"),
        ({"returns": {"tuple": [[1]]}}, "examine call 1: returns: .tuple: ...."),
        ({"returns": {"tuple": []}}, "examine call 1: returns: .tuple: ...."),
        ({"returns": {"x": [1]}}, "examine call 1: returns is a mapping"),
    ],
)  # fmt: skip
def test_what_the_examiner_cannot_hold_is_refused_in_a_sentence_naming_the_call(call, message):
    with pytest.raises(LevelError, match=message) as raised:
        examiner(call)
    assert raised.value.at == {"field": "examine"}


def test_a_call_that_is_refused_is_named_by_its_number():
    with pytest.raises(LevelError, match="examine call 3: arg 2: a pair"):
        examiner({}, {"args": [[[1]]]}, {"args": [0, [[1, [2]]]]})


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


# -- M5.2-4b-1: the examiner's call and its judging (the facts: status, `call`, the steps; not the words) --------------

DEFINE = "def gallop(n):\n    pawn.move(3)\n"  # reaches the goal of ROW whatever it is called with
WANTS = 31337  # an answer no summary may ever show
EAST = {"facing": "east"}


def call_of(*calls, code=DEFINE, constraints=True, **overrides):
    """Run `code` on an examiner level whose calls are given, and return the (verdict) result."""
    return run_level(examiner(*calls, start=EAST, **overrides), code, enforce_constraints=constraints)


def pit_level(*calls):
    return make_level("P O G\n", api=API, start=EAST, legend={"O": {"tile": "pit"}}, examine={"function": "gallop", "calls": list(calls)})


def depths(result, start=0):
    return [step["depth"] for step in result.steps[start:]]


def test_a_call_with_fewer_args_than_parameters_lets_a_default_fill_in():
    result = call_of({"args": [1], "returns": 5}, code="def gallop(n, m=5):\n    pawn.move(3)\n    return m\n")
    assert result.status == "solved"
    assert (result.call.returned, result.call.wanted) == ("5", "5")


def test_a_def_with_star_args_takes_any_number_of_arguments():
    result = call_of({"args": [1, 2, 3], "returns": 3}, code="def gallop(*a):\n    pawn.move(3)\n    return len(a)\n")
    assert result.status == "solved" and result.call.returned == "3"


@pytest.mark.parametrize(
    ("code", "args"),
    [
        ("def gallop(n):\n    pawn.move(3)\n", [1, 2]),  # too many
        ("def gallop(n, m):\n    pawn.move(3)\n", [1]),  # too few
        ("def gallop():\n    pawn.move(3)\n", [1]),  # none taken
        ("def gallop(n, *, m):\n    pawn.move(3)\n", [1]),  # a keyword-only one nobody gives
        ("x = 1\n", []),  # missing
        ("gallop = 5\n", []),  # a number
        ("gallop = 'text'\n", []),  # text
        ("class gallop:\n    pass\n", []),  # a class
    ],
)
def test_a_problem_with_the_function_is_found_without_calling_it(code, args):
    result = call_of({"args": args, "returns": WANTS}, code=code, constraints=False)
    assert result.status == "incomplete"
    assert result.call.returned is None and result.call.wanted == repr(WANTS)
    assert result.call.first_step == len(result.steps)
    assert result.final == result.start  # the call was never made, so nothing moved
    assert str(WANTS) not in result.summary and result.error is None


def test_the_functions_steps_are_inside_the_call():
    result = call_of({"args": [3]}, code="def gallop(n):\n    pawn.move(n)\n")
    first = result.call.first_step
    assert result.status == "solved" and 0 < first < len(result.steps)
    assert depths(result, 0)[:first] == [0] * first
    assert depths(result, first) == [1] * (len(result.steps) - first)
    assert result.steps[first]["scope"] == "gallop"
    assert any(step["events"] for step in result.steps[first:])


@pytest.mark.parametrize(
    ("returns", "gives", "solved"),
    [
        (7, "7", True),
        (7, "'7'", False),
        ("7", "7", False),
        (1, "True", False),
        (True, "1", False),
        (1, "1.0", False),
        (1.0, "1", False),
        (None, "None", True),
        (None, "0", False),
        (0, "None", False),
        (False, "0", False),
        ("a", "'a'", True),
        (1.5, "1.5", True),
        (False, "False", True),
    ],
)
def test_the_answer_must_be_the_same_kind_of_thing_and_equal(returns, gives, solved):
    result = call_of({"args": [1], "returns": returns}, code=f"def gallop(n):\n    pawn.move(3)\n    return {gives}\n")
    assert result.status == ("solved" if solved else "incomplete")
    assert result.call.wanted == repr(returns) and result.call.returned == repr(eval(gives))


def test_a_call_that_is_not_judged_ignores_what_comes_back():
    result = call_of({"args": [1]}, code="def gallop(n):\n    pawn.move(3)\n    return [1, 2]\n")
    assert result.status == "solved" and result.call.wanted is None and result.call.returned == "[1, 2]"


@pytest.mark.parametrize(
    ("moves", "gives", "status"),
    [("pawn.move(3)", WANTS, "solved"), ("pawn.move(1)", WANTS, "incomplete"), ("pawn.move(3)", 1, "incomplete"), ("pass", 1, "incomplete")],
)
def test_the_answer_and_the_board_are_both_judged(moves, gives, status):
    result = call_of({"args": [1], "returns": WANTS}, code=f"def gallop(n):\n    {moves}\n    return {gives}\n")
    assert result.status == status


def test_the_answer_is_judged_before_the_board():
    wrong_answer = call_of({"args": [1], "returns": 2}, code="def gallop(n):\n    pawn.move(3)\n    return 3\n")
    wrong_board = call_of({"args": [1], "returns": 2}, code="def gallop(n):\n    return 2\n")
    both = call_of({"args": [1], "returns": 2}, code="def gallop(n):\n    return 3\n")
    assert "it wanted 2 and got 3" in wrong_answer.summary and "when the call ended" not in wrong_answer.summary
    assert "got the 2 it wanted, but when the call ended" in wrong_board.summary
    assert both.summary == wrong_answer.summary != wrong_board.summary


def test_a_run_never_changes_the_levels_own_arguments():
    level = examiner({"args": [1, "a", None]}, {"args": [2]})
    run_level(level, "def gallop(n, *rest):\n    n = 99\n    rest = ()\n    pawn.move(3)\n")
    assert [call.args for call in level.examine.calls] == [[1, "a", None], [2]]


def test_the_call_gets_a_copy_of_its_arguments():
    code = "def f(items):\n    items.append(4)\n    print('in')\n"
    args = [[1, 2, 3]]
    run = execute(compile(code, PLAYER_FILENAME, "exec"), code, {}, line_budget=1000, call=("f", args))
    assert args == [[1, 2, 3]] and run.finished and run.problem is None and run.error is None
    assert run.call_output == "in\n"


def test_execute_without_a_call_leaves_the_call_facts_alone():
    code = "print('a')\n"
    run = execute(compile(code, PLAYER_FILENAME, "exec"), code, {}, line_budget=1000)
    assert (run.finished, run.problem, run.returned, run.call_output, run.output) == (False, None, None, "", "a\n")


def test_what_the_program_prints_is_not_what_the_call_printed():
    code = "print('a')\ndef f():\n    print('b')\n"
    run = execute(compile(code, PLAYER_FILENAME, "exec"), code, {}, line_budget=1000, call=("f", []))
    assert (run.output, run.call_output) == ("a\nb\n", "b\n")


def test_an_error_on_the_calls_second_line_names_the_players_line_and_no_engine_frame():
    result = call_of({"args": [1], "returns": WANTS}, code="def gallop(n):\n    x = 1\n    y = x / 0\n")
    assert result.status == "error" and result.error.type == "ZeroDivisionError" and result.error.line == 3
    assert result.call.returned is None and result.call.first_step < len(result.steps)
    assert result.steps[-1]["line"] == 3 and result.steps[-1]["depth"] == 1
    files = [line for line in result.error.traceback.splitlines() if line.lstrip().startswith("File ")]
    assert files and all(PLAYER_FILENAME in line for line in files)
    assert "runner.py" not in result.error.traceback and "rankfile" not in result.error.traceback


def test_an_error_is_judged_before_the_answer_and_the_function():
    assert call_of({"args": [1], "returns": 2}, code="def gallop(n):\n    return 1 / 0\n").status == "error"
    assert call_of({"args": [1], "returns": 2}, code="1 / 0\n", constraints=False).status == "error"


def test_a_program_that_fails_before_the_call_has_a_call_that_never_started():
    result = call_of({"args": [1], "returns": 2}, code="x = 1\ny = x / 0\n", constraints=False)
    assert result.status == "error" and result.call.returned is None
    assert result.call.first_step == len(result.steps) and result.call.text == "gallop(1)"


def test_code_that_never_ran_has_no_call():
    broken = call_of({"args": [1]}, code="def (\n")
    forbidden = call_of({"args": [1]}, code="pawn.move(1)\n")
    assert (broken.status, forbidden.status) == ("error", "constraint")
    assert broken.call is None and forbidden.call is None


def test_a_level_without_an_examiner_has_no_call():
    assert run_level(make_level(ROW, api=API), "pawn.move(3)\n").call is None


def test_a_call_that_prints_and_hands_back_nothing():
    result = call_of({"args": [1], "returns": None}, code="def gallop(n):\n    print('hi')\n    pawn.move(3)\n")
    assert result.status == "solved" and result.call.returned == "None" and result.call.wanted == "None"
    assert result.output == "hi\n"
    printing = [index for index, step in enumerate(result.steps) if step["output"]]
    assert printing and all(index >= result.call.first_step for index in printing)


def test_a_function_that_never_ends_is_a_timeout_and_the_budget_covers_the_call():
    code = "def gallop(n):\n    while True:\n        pass\n"
    result = run_level(examiner({"args": [1], "returns": 2}), code, line_budget=200)
    assert result.status == "timeout" and result.call.returned is None and result.lines_run >= 200
    assert result.steps[-1]["depth"] == 1


def test_exit_in_the_call_ends_it_quietly_with_nothing_handed_back():
    result = call_of({"args": [1], "returns": None}, code="def gallop(n):\n    pawn.move(3)\n    exit()\n    pawn.move(1)\n")
    assert result.status == "solved" and result.call.returned == "None" and result.error is None
    result = call_of({"args": [1], "returns": 4}, code="import sys\ndef gallop(n):\n    sys.exit()\n", constraints=False)
    assert result.status == "incomplete" and result.call.returned == "None"


def test_a_pit_walked_into_during_the_call_is_a_loss():
    result = run_level(pit_level({"args": [], "returns": 2}), "def gallop():\n    pawn.move(2)\n    return 2\n")
    assert result.status == "lost" and result.call.returned in (None, "2")
    assert result.steps[-1]["depth"] == 1 and result.call.first_step < len(result.steps)


def test_a_loss_in_the_program_is_judged_before_a_problem_with_the_function():
    result = run_level(pit_level({}), "pawn.move(1)\n", enforce_constraints=False)
    assert result.status == "lost" and result.call.returned is None


def test_each_recorded_case_has_its_own_call_and_the_verdict_shows_the_failing_one():
    level = examiner({"args": [3], "board": 1}, {"args": [1], "board": 2}, start=EAST, **boards(OTHER))
    result = run_level(level, "def gallop(n):\n    pawn.move(n)\n")
    assert result.status == "incomplete" and result.case == 1
    assert result.call.text == "gallop(1)"
    recorded = result.to_dict()["cases"]
    assert [case["call"]["text"] for case in recorded] == ["gallop(3)", "gallop(1)"]
    assert [case["status"] for case in recorded] == ["solved", "incomplete"]
    for case in recorded:
        first = case["call"]["first_step"]
        assert 0 < first < len(case["steps"])
        assert [step["depth"] for step in case["steps"]] == [0] * first + [1] * (len(case["steps"]) - first)
        assert case["call"]["wanted"] is None
    assert result.to_dict()["call"] == recorded[1]["call"]


# -- M5.2-4b-2: the examiner's words (what happened, then the examiner's line in curly quotes) ---------------------

MOVES = "    pawn.move(3)\n"  # reaches the goal of ROW
SAYS = ["reach_goal", {"say": "Open sesame"}]
CORRECT = "“Correct. I had rather hoped to be disappointed.”"
NOBODY = "“I called. Nobody answered to that name.”"
CANNOT = "“I can call a function. I cannot call that.”"
FEWER = "“I hand over what the task says: no more, no fewer.”"
WRONG_KIND = "“The right idea in the wrong kind of thing is still the wrong thing.”"
NOT_THE_ANSWER = "“An answer, certainly. Not the answer.”"
NOTHING_PUT = "“I held out my hand, and nothing was put in it.”"
STANDS = "stopped on a1, and the goal is on d1."
NEEDS_A_NAME = "Each value needs a name inside the parentheses of its `def` line."
DEFINE_IT = "Define it with `def gallop(...):`."
LETTER = "It has `gallup`: the examiner needs the name letter for letter."
NOT_A_FUNCTION = "not a function. Keep that name for the `def`."


def row(code, args, said, *, function="gallop", **call):
    """One case of the table: `code` run on the east-facing row, the examiner's call (`call` may hold `returns`)."""
    return pytest.param(code, args, call, function, said, id=said[:70])


THE_WORDS = [
    row(f"def gallop(a, b):\n{MOVES}", [1, 3], f"The examiner called `gallop(1, 3)`, and the board is as it should be. {CORRECT}"),
    row(f"def count(n):\n{MOVES}    return 7\n", [4], f"The examiner called `count(4)`: it wanted 7 and got 7. {CORRECT}", function="count", returns=7),
    row(f"def count(n):\n{MOVES}", [4], f"The examiner called `count(4)`: it wanted None and got None. {CORRECT}", function="count", returns=None),
    row("x = 1\n", [1, 3], f"The examiner called `gallop(1, 3)`, and your program has no function called `gallop`. {DEFINE_IT} {NOBODY}"),
    row("def gallup(a, b):\n    pass\n", [1, 3], f"The examiner called `gallop(1, 3)`, and your program has no function called `gallop`. {LETTER} {NOBODY}"),
    row("gallup = 3\n", [1, 3], f"The examiner called `gallop(1, 3)`, and your program has no function called `gallop`. {DEFINE_IT} {NOBODY}"),
    row("x = 1\n", [], f"The examiner called `pwn()`, and your program has no function called `pwn`. Define it with `def pwn(...):`. {NOBODY}", function="pwn"),
    row("gallop = 3\n", [1, 3], f"The examiner called `gallop(1, 3)`, but `gallop` in your program is 3, a whole number (an int), {NOT_A_FUNCTION} {CANNOT}"),
    row("gallop = 'hi'\n", [1, 3], f"The examiner called `gallop(1, 3)`, but `gallop` in your program is 'hi', text (a str), {NOT_A_FUNCTION} {CANNOT}"),
    row("gallop = 2.5\n", [1, 3], f"The examiner called `gallop(1, 3)`, but `gallop` in your program is 2.5, a number with a decimal point (a float), {NOT_A_FUNCTION} {CANNOT}"),
    row("gallop = [1, 2]\n", [1, 3], f"The examiner called `gallop(1, 3)`, but `gallop` in your program is [1, 2], a list, {NOT_A_FUNCTION} {CANNOT}"),
    row("gallop = None\n", [1, 3], f"The examiner called `gallop(1, 3)`, but `gallop` in your program is None, {NOT_A_FUNCTION} {CANNOT}"),
    row("class gallop:\n    pass\n", [1, 3], f"The examiner called `gallop(1, 3)`, but `gallop` in your program is a class, {NOT_A_FUNCTION} {CANNOT}"),
    row("def gallop(n):\n    pass\n", [1, 3], f"The examiner called `gallop(1, 3)` with 2 values, and your `gallop` takes 1. {NEEDS_A_NAME} {FEWER}"),
    row("def gallop(n, m):\n    pass\n", [1], f"The examiner called `gallop(1)` with 1 value, and your `gallop` takes 2. {NEEDS_A_NAME} {FEWER}"),
    row("def gallop(n):\n    pass\n", [], f"The examiner called `gallop()` with no values, and your `gallop` takes 1. {NEEDS_A_NAME} {FEWER}"),
    row("def gallop():\n    pass\n", [1, 3], f"The examiner called `gallop(1, 3)` with 2 values, and your `gallop` takes none. {NEEDS_A_NAME} {FEWER}"),
    row("def gallop(n, m=0):\n    pass\n", [], f"The examiner called `gallop()` with no values, and your `gallop` takes 1 or 2. {NEEDS_A_NAME} {FEWER}"),
    row("def gallop(n, m=0):\n    pass\n", [1, 2, 3], f"The examiner called `gallop(1, 2, 3)` with 3 values, and your `gallop` takes 1 or 2. {NEEDS_A_NAME} {FEWER}"),
    row("def gallop(n, m=0, k=0):\n    pass\n", [], f"The examiner called `gallop()` with no values, and your `gallop` takes from 1 to 3. {NEEDS_A_NAME} {FEWER}"),
    row("def gallop(n, *rest):\n    pass\n", [], f"The examiner called `gallop()` with no values, and your `gallop` takes 1 or more. {NEEDS_A_NAME} {FEWER}"),
    row("def gallop(n, *, m):\n    pass\n", [1], f"The examiner called `gallop(1)` with 1 value, and your `gallop` also needs `m`, which can only be given by name. Take it before the `*` in its `def` line, or give it a default value. {FEWER}"),
    row("def gallop(*, m, k):\n    pass\n", [], f"The examiner called `gallop()` with no values, and your `gallop` also needs `m` and `k`, which can only be given by name. Take them before the `*` in its `def` line, or give each one a default value. {FEWER}"),
    row("def gallop(m=0, n=0, k=0):\n    pass\n", [1, 2, 3, 4], f"The examiner called `gallop(1, 2, 3, 4)` with 4 values, and your `gallop` takes up to 3. {NEEDS_A_NAME} {FEWER}"),
    row("def gallop(m=0):\n    pass\n", [1, 2], f"The examiner called `gallop(1, 2)` with 2 values, and your `gallop` takes none or 1. {NEEDS_A_NAME} {FEWER}"),
    row(f"def count(n):\n    print(7)\n{MOVES}", [4], "The examiner called `count(4)` and got nothing back (None); it wanted 7. Your function printed its answer, but the examiner doesn't read the screen: `print` shows a value, `return` hands it back. “You showed me the answer. I asked you to hand it to me.”", function="count", returns=7),
    row(f"def count(n):\n    print('  7  ')\n{MOVES}", [4], "The examiner called `count(4)` and got nothing back (None); it wanted 7. Your function printed its answer, but the examiner doesn't read the screen: `print` shows a value, `return` hands it back. “You showed me the answer. I asked you to hand it to me.”", function="count", returns=7),
    row(f"def count(n):\n    print('hi')\n{MOVES}", [4], f"The examiner called `count(4)` and got nothing back (None); it wanted 7. A function hands a value back only with `return`: check that every way through `count` reaches one. {NOTHING_PUT}", function="count", returns=7),
    row(f"def count(n):\n    print('Open sesame')\n{MOVES}", [4], f"The examiner called `count(4)` and got nothing back (None); it wanted 7. A function hands a value back only with `return`: check that every way through `count` reaches one. {NOTHING_PUT}", function="count", returns=7),
    row(f"def count(n):\n    print(77)\n{MOVES}", [4], f"The examiner called `count(4)` and got nothing back (None); it wanted 7. A function hands a value back only with `return`: check that every way through `count` reaches one. {NOTHING_PUT}", function="count", returns=7),
    row(f"def count(n):\n{MOVES}", [4], f"The examiner called `count(4)` and got nothing back (None); it wanted 7. A function hands a value back only with `return`: check that every way through `count` reaches one. {NOTHING_PUT}", function="count", returns=7),
    row(f"print('before')\ndef count(n):\n{MOVES}", [4], f"The examiner called `count(4)` and got nothing back (None); it wanted 7. A function hands a value back only with `return`: check that every way through `count` reaches one. {NOTHING_PUT}", function="count", returns=7),
    row(f"def count(n):\n{MOVES}    return 8\n", [4], f"The examiner called `count(4)`: it wanted 7 and got 8. {NOT_THE_ANSWER}", function="count", returns=7),
    row(f"def count(n):\n{MOVES}    return '7'\n", [4], f"The examiner called `count(4)`: it wanted 7 and got '7', which is text (a str), not a whole number (an int). {WRONG_KIND}", function="count", returns=7),
    row(f"def count(n):\n{MOVES}    return True\n", [4], f"The examiner called `count(4)`: it wanted 1 and got True, which is True or False (a bool), not a whole number (an int). {WRONG_KIND}", function="count", returns=1),
    row(f"def count(n):\n{MOVES}    return 2\n", [4], f"The examiner called `count(4)`: it wanted 2.0 and got 2, which is a whole number (an int), not a number with a decimal point (a float). {WRONG_KIND}", function="count", returns=2.0),
    row(f"def count(n):\n{MOVES}    return [1]\n", [4], f"The examiner called `count(4)`: it wanted 'a' and got [1], which is a list, not text (a str). {WRONG_KIND}", function="count", returns="a"),
    row(f"def count(n):\n{MOVES}    return 8\n", [4], f"The examiner called `count(4)`: it wanted nothing back (None) and got 8. {NOT_THE_ANSWER}", function="count", returns=None),
    row("def gallop(a, b):\n    pass\n", [1, 3], f"The examiner called `gallop(1, 3)`, and when the call ended your pawn {STANDS} “The call ended. The task had not.”"),
    row("def count(n):\n    return 7\n", [4], f"The examiner called `count(4)` and got the 7 it wanted, but when the call ended your pawn {STANDS} “The answer is not the whole of the task.”", function="count", returns=7),
]  # fmt: skip


@pytest.mark.parametrize(("code", "args", "call", "function", "said"), THE_WORDS)
def test_the_examiner_says_what_happened_and_then_its_line(code, args, call, function, said):
    result = call_of({"args": args, **call}, code=code, constraints=False, function=function)
    assert result.summary == said
    happened, line = result.call.happened, result.call.said
    assert happened and line and result.summary == f"{happened} “{line}”"  # the two parts reach the UI apart


def test_the_two_parts_are_in_the_json_of_a_result():
    result = call_of({"args": [1]}, code="def gallop(n):\n    pass\n", constraints=False).to_dict()
    call = result["call"]
    assert call["said"] == examiner_line("board") and call["happened"] and result["summary"] == f"{call['happened']} “{call['said']}”"


@pytest.mark.parametrize(
    "code",
    [
        "def gallop(n):\n    raise ValueError('x')\n",
        "def gallop(n):\n    while True:\n        pass\n",
        "def (\n",
        "x = 1 / 0\n",
    ],
)
def test_no_examiner_words_means_no_parts(code):
    result = run_level(examiner({"args": [1], "returns": 2}, start=EAST), code, line_budget=200, enforce_constraints=False)
    assert result.status in ("error", "timeout") and (result.call is None or (result.call.happened, result.call.said) == (None, None))


def test_a_lost_run_a_refused_program_and_an_unjudged_run_have_no_parts():
    lost = run_level(pit_level({}), "pawn.move(1)\n", enforce_constraints=False)
    assert lost.status == "lost" and (lost.call.happened, lost.call.said) == (None, None)
    refused = call_of({"args": [1]}, code="pawn.move(1)\n")
    assert refused.status == "constraint" and refused.call is None
    unjudged = run_level(examiner({"args": [1]}, start=EAST), DEFINE, judge=False)
    assert unjudged.call is not None and (unjudged.call.happened, unjudged.call.said) == (None, None)


@pytest.mark.parametrize(("returns", "said"), [(NOT_JUDGED, "The examiner called `gallop(1)`, and when the call ended "), (7, "The examiner called `gallop(1)` and got the 7 it wanted, but when the call ended ")])
def test_several_unmet_goals_are_joined_with_also(returns, said):
    call = {"args": [1]} if returns is NOT_JUDGED else {"args": [1], "returns": returns}
    result = call_of(call, code="def gallop(n):\n    return 7\n", constraints=False, objectives=SAYS)
    assert result.status == "incomplete"
    assert result.summary.startswith(said + f"your pawn {STANDS} Also, nobody heard the phrase \"Open sesame\". Use print() to say it. “")


def test_the_examiners_line_is_reachable_apart_from_what_happened():
    assert examiner_line("missing") == "I called. Nobody answered to that name."
    assert examiner_line("unexpected") == examiner_line("wrong_value")
    assert examiner_line("passed_answered") == examiner_line("passed")
    assert call_of({"args": [1, 3]}, code="x = 1\n", constraints=False).summary.endswith(f"“{examiner_line('missing')}”")


def test_the_answer_wanted_is_shown_only_where_the_table_shows_it():
    for code in ("x = 1\n", "gallop = 3\n", "def gallop():\n    pass\n", "def gallup(n):\n    pass\n", "def gallop(n, *, m):\n    pass\n"):
        assert str(WANTS) not in call_of({"args": [1], "returns": WANTS}, code=code, constraints=False).summary
    assert str(WANTS) in call_of({"args": [1], "returns": WANTS}, code="def gallop(n):\n    return 1\n", constraints=False).summary


# -- M5.2-4c: the review's fixes ------------------------------------------------------------------------------------

DOCTORED = [
    "gallop.__signature__ = 5\n",  # inspect.signature would follow it, and fail
    "gallop.__signature__ = 'nonsense'\n",
    "gallop.__wrapped__ = gallop\n",  # inspect.signature would find a loop
]


@pytest.mark.parametrize("doctor", DOCTORED)
def test_a_signature_or_wrapped_the_program_sets_is_never_consulted(doctor):
    code = f"def gallop(n):\n    pawn.move(3)\n{doctor}"
    fine = call_of({"args": [1]}, code=code, constraints=False)
    assert fine.status == "solved" and fine.error is None
    assert 0 < fine.call.first_step < len(fine.steps)  # the program's own lines came first
    wrong = call_of({"args": [1, 2]}, code=code, constraints=False)
    assert wrong.status == "incomplete" and wrong.error is None
    assert wrong.call.first_step == len(wrong.steps) > 0  # the call was never made
    assert wrong.final == wrong.start
    assert "and your `gallop` takes 1. " in wrong.summary and wrong.summary.endswith(FEWER)


@pytest.mark.parametrize("doctor", DOCTORED)
def test_execute_checks_a_doctored_function_by_its_own_parameters(doctor):
    code = f"def gallop(n, m=0, *, k):\n    pass\n{doctor}"
    run = execute(compile(code, PLAYER_FILENAME, "exec"), code, {}, line_budget=1000, record=True, call=("gallop", [1]))
    assert run.error is None and run.problem == "arguments" and run.first_step == len(run.tracer.steps) > 0
    assert list(run.signature.parameters) == ["n", "m", "k"]
    run = execute(compile(code, PLAYER_FILENAME, "exec"), code, {}, line_budget=1000, call=("gallop", [1, 2, 3]))
    assert run.problem == "arguments"


def test_a_function_whose_defaults_were_replaced_is_read_as_it_now_is():
    code = "def gallop(n, m):\n    pass\ngallop.__defaults__ = (0,)\n"
    run = execute(compile(code, PLAYER_FILENAME, "exec"), code, {}, line_budget=1000, call=("gallop", [1]))
    assert run.problem is None and run.finished and run.error is None


@pytest.mark.parametrize(
    "rules",
    [{"gallop": {"calls": 1}}, {"gallop": {"params": 1, "calls": 3}}, {"hop": {"calls": 2}, "gallop": {"calls": 2, "returns": True}}],
)
def test_the_examiner_makes_the_calls_so_its_function_cannot_be_asked_to_be_called(rules):
    with pytest.raises(LevelError, match="the examiner makes the calls to 'gallop', so constraints.functions can't ask the program to call it") as raised:
        examiner({"args": [1]}, constraints={"functions": rules})
    assert raised.value.at == {"field": "examine"}


def test_a_rule_that_asks_for_calls_of_another_function_is_fine_on_an_examiner_level():
    level = examiner({"args": [1]}, constraints={"functions": {"hop": {"calls": 2}, "gallop": {"params": 1}}})
    assert level.constraints.functions["hop"].calls == 2


# -- a lesson snippet the examiner calls (M5.2-5a) -------------------------------------------------------------

DEFINES = "def gallop(a, b):\n    pawn.move(a)\n    return b\n"


def sandbox(code, call="gallop(1, 2)", **kwargs):
    return run_sandbox(code, ["move", "turn_left"], call=call, **kwargs)


@pytest.mark.parametrize(
    ("text", "parsed"),
    [
        ("gallop(1, 2)", ("gallop", [1, 2])),
        ("  gallop( -1 , 2.5 , 'a', \"b\", True, False, None )  ", ("gallop", [-1, 2.5, "a", "b", True, False, None])),
        ("hop()", ("hop", [])),
        ("hop(-0.5)", ("hop", [-0.5])),
    ],
)
def test_a_snippets_call_is_read_with_ast(text, parsed):
    name, args = parse_snippet_call(text)
    assert (name, args) == parsed
    assert [type(arg) for arg in args] == [type(arg) for arg in parsed[1]]  # True is not 1


@pytest.mark.parametrize(
    "text",
    ["pawn.move(1)", "gallop(a=1)", "gallop(x)", "gallop(1 + 2)", "gallop(-True)", "gallop(-'a')", "gallop(--1)", "gallop(+1)",
     "gallop([1])", "gallop(b'a')", "gallop(1j)", "gallop(*args)", "gallop(1)(2)", "gallop", "gallop(1); gallop(2)", "gallop(",
     "gallop(1)\ngallop(2)", "", "x = gallop(1)"],
)  # fmt: skip
def test_a_snippets_call_that_is_not_one_plain_call_is_a_lesson_authors_mistake(text):
    with pytest.raises(ValueError, match="must be one call of a plain function name with plain values") as raised:
        parse_snippet_call(text)
    assert repr(text) in str(raised.value)
    if text:  # run_sandbox refuses it the same way, before anything runs
        with pytest.raises(ValueError, match="plain function name"):
            sandbox(DEFINES, call=text)


def test_a_call_that_is_made_is_a_finished_run_that_says_so():
    result = sandbox("def gallop(a, b):\n    pawn.move(a)\n")
    assert result.status == "finished" and result.summary == "The examiner called `gallop(1, 2)`."
    assert result.call.text == "gallop(1, 2)" and result.call.returned == "None" and result.call.wanted is None
    assert "“" not in result.summary


def test_a_call_that_hands_something_back_says_what():
    result = sandbox("def double(n):\n    return n * 2\n", call="double(4)")
    assert (result.status, result.summary) == ("finished", "The examiner called `double(4)` and got 8 back.")
    assert result.call.returned == "8"
    assert sandbox("def f(s):\n    return s\n", call="f('hi')").summary == "The examiner called `f('hi')` and got 'hi' back."


def test_the_calls_steps_start_at_first_step_one_level_deep():
    result = sandbox("pawn.move(1)\ndef gallop(a, b):\n    pawn.move(a)\n    pawn.move(b)\n", call="gallop(1, 1)")
    steps = result.to_dict()["steps"]
    first = result.call.first_step
    assert result.status == "finished" and 0 < first < len(steps), result.summary
    assert all(step["depth"] == 0 for step in steps[:first])
    assert [step["depth"] for step in steps[first:]] == [1, 1]
    assert {step["scope"] for step in steps[first:]} == {"gallop"}
    assert result.final != result.start


@pytest.mark.parametrize(
    ("code", "call", "kind"),
    [
        ("pawn.move(1)\n", "gallop(1, 2)", "missing"),
        ("gallop = 5\n", "gallop(1, 2)", "not_function"),
        (DEFINES, "gallop(1)", "arguments"),
        (DEFINES, "gallop(1, 2, 3)", "arguments"),
    ],
)
def test_a_function_the_examiner_cannot_call_is_incomplete_in_the_examiners_words(code, call, kind):
    result = sandbox(code, call=call)
    assert result.status == "incomplete" and result.call.returned is None and result.call.wanted is None
    assert result.summary.endswith(f"“{examiner_line(kind)}”")
    assert result.call.said == examiner_line(kind) and result.summary == f"{result.call.happened} “{result.call.said}”"
    assert ("no function called `gallop`" in result.summary) == (kind == "missing")
    assert ("is 5" in result.summary or "a number" in result.summary) == (kind == "not_function")
    assert ("takes 2" in result.summary) == (kind == "arguments")


def test_the_words_are_the_ones_a_level_run_gives_for_the_same_trouble():
    code = "def gallop(a, b):\n    pass\n"
    level = examiner({"args": [1]})
    assert sandbox(code, call="gallop(1)").summary == run_level(level, code).summary


def test_a_near_miss_among_the_programs_own_functions_is_named():
    result = sandbox("def galop(a, b):\n    pass\n")
    assert result.status == "incomplete" and "It has `galop`" in result.summary


@pytest.mark.parametrize(
    ("code", "status"),
    [
        ("def gallop(a, b):\n    pawn.move(a)\n    raise ValueError('x')\n", "error"),
        ("def gallop(a, b):\n    while True:\n        pass\n", "timeout"),
        ("pawn.move(1)\nboom\ndef gallop(a, b):\n    pass\n", "error"),
        ("def gallop(a, b):\n    pass\nwhile True:\n    pass\n", "timeout"),
    ],
)
def test_an_error_a_loss_or_a_timeout_is_as_any_snippet_with_the_call_filled(code, status):
    result = sandbox(code)
    assert result.status == status, result.summary
    assert result.call is not None and result.call.text == "gallop(1, 2)" and result.call.returned is None
    assert (result.call.happened, result.call.said) == (None, None)


def test_a_snippets_call_that_ran_and_was_not_judged_has_no_parts():
    result = sandbox(DEFINES)
    assert result.status == "finished" and (result.call.happened, result.call.said) == (None, None)


def test_a_loss_inside_the_call_is_a_lost_snippet():
    board = {"map": "O\n.\nP\n", "legend": {"O": {"tile": "pit"}}}
    result = sandbox("def gallop(a, b):\n    pawn.move(a)\n", call="gallop(2, 0)", lesson_board=board)
    assert result.status == "lost" and result.call.text == "gallop(2, 0)"


def test_the_called_function_is_not_noted_as_never_called_but_another_one_is():
    result = sandbox("def gallop(a, b):\n    pass\ndef hop():\n    pass\n")
    notes = [warning["message"] for warning in result.to_dict()["warnings"]]
    assert len(notes) == 1 and "`hop` is defined here but never called" in notes[0]
    assert not sandbox("def gallop(a, b):\n    pass\n").to_dict()["warnings"]


def test_the_call_is_made_on_the_lesson_board():
    result = sandbox("def gallop(a, b):\n    pawn.move(a)\n", lesson_board={"map": ". . .\n. P .\n"})
    assert result.status == "finished" and result.final != result.start


@pytest.mark.parametrize("call", [None, ""])
def test_without_a_call_a_snippet_runs_as_before(call):
    result = sandbox("pawn.move(1)\n", call=call)
    assert result.status == "finished" and result.summary == "Finished." and result.call is None


def test_the_bridge_takes_the_call_as_a_fifth_argument_and_the_old_four_still_work():
    args = ("def gallop(a, b):\n    return a + b\n", json.dumps(["move"]), "null", "pawn")
    with_call = json.loads(bridge.run_sandbox(*args, "gallop(1, 2)"))
    assert with_call["status"] == "finished" and with_call["call"]["returned"] == "3"
    assert with_call["summary"] == "The examiner called `gallop(1, 2)` and got 3 back."
    for old in (json.loads(bridge.run_sandbox(*args)), json.loads(bridge.run_sandbox(*args, ""))):
        assert old["call"] is None and old["summary"] == "Finished."
    assert json.loads(bridge.run_sandbox("pawn.move(1)\n", json.dumps(["move"]), call="gallop(1)"))["status"] == "incomplete"
