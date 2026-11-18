"""M5.2's contract (functions and the examiner): the shapes' defaults and JSON keys, on a level that uses none of it.

Later packages fill the shapes in; what is pinned here stays true for a program with no function and a level with
no examiner."""

import copy

from rankfile.levels import NOT_JUDGED, Constraints, ExamineCall, sandbox_level
from rankfile.runner import run_sandbox


def test_a_level_without_an_examiner_describes_none():
    info = sandbox_level(["move"]).describe()
    assert info["examine"] is None
    assert info["constraints"]["functions"] == {}
    assert info["constraints"]["define"] == 0


def test_constraints_ask_nothing_of_functions_by_default():
    constraints = Constraints()
    assert constraints.functions == {}
    assert constraints.define == 0


def test_an_examiner_call_judges_only_the_board_unless_it_says():
    call = ExamineCall()
    assert call.args == [] and call.board == 1
    assert call.returns is NOT_JUDGED
    assert copy.deepcopy(call).returns is NOT_JUDGED  # copies keep the sentinel
    assert ExamineCall(returns=None).returns is None  # `returns: null` wants None


def test_an_examiner_call_as_code_writes_it():
    assert ExamineCall([1, 3]).text("gallop") == "gallop(1, 3)"
    assert ExamineCall([]).text("stride") == "stride()"
    assert ExamineCall(["up", 2]).text("fetch") == "fetch('up', 2)"


def test_a_run_with_no_examiner_has_no_call_and_its_steps_are_at_module_level():
    result = run_sandbox("pawn.move(1)\n", ["move"]).to_dict()
    assert result["call"] is None
    assert result["steps"]
    for step in result["steps"]:
        assert step["globals"] == []
        assert step["depth"] == 0
        assert step["continues"] is False


def test_a_lesson_snippet_accepts_a_call():
    assert run_sandbox("pawn.move(1)\n", ["move"], call="gallop(1, 2)").status == "finished"
