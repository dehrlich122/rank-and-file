import json
import sys
import time

from conftest import make_level
from rankfile import bridge
from rankfile.runner import run_level, run_sandbox, run_snippet

# -- plain snippets ---------------------------------------------------------------


def test_captures_printed_output():
    result = run_snippet('print("hello")\nprint(1 + 2)')
    assert result.status == "ok"
    assert result.output == "hello\n3\n"
    assert result.error is None
    assert result.lines_run == 2


def test_counts_every_line_executed_in_a_loop():
    result = run_snippet("for i in range(3):\n    x = i\n")
    # the `for` line is revisited on every iteration, plus once to finish
    assert result.lines_run == 7


def test_syntax_error_reports_the_line():
    result = run_snippet('print("ok")\nprint("oops"\n')
    assert result.status == "error"
    assert result.error.type == "SyntaxError"
    assert result.error.line == 2
    assert result.lines_run == 0


def test_runtime_error_keeps_output_so_far():
    result = run_snippet('print("before")\nprint(1 / 0)\n')
    assert result.status == "error"
    assert result.output == "before\n"
    assert result.error.type == "ZeroDivisionError"
    assert result.error.line == 2


def test_endless_loop_is_stopped_quickly():
    started = time.perf_counter()
    result = run_snippet("x = 0\nwhile True:\n    x += 1\n", line_budget=10_000)
    assert time.perf_counter() - started < 2
    assert result.status == "timeout"
    assert result.error.line in (2, 3)
    assert "never finished" in result.error.friendly
    assert result.lines_run == 10_001


def test_except_exception_cannot_swallow_the_budget():
    code = "while True:\n    try:\n        pass\n    except Exception:\n        pass\n"
    assert run_snippet(code, line_budget=1_000).status == "timeout"


def test_exit_just_ends_the_program():
    result = run_snippet('print("a")\nexit()\nprint("b")')
    assert result.status == "ok"
    assert result.output == "a\n"


def test_namespace_can_be_reused_between_runs():
    namespace = {"__name__": "__main__"}
    run_snippet("gold = 5", namespace=namespace)
    assert run_snippet("print(gold * 2)", namespace=namespace).output == "10\n"


def test_tracing_is_switched_off_afterwards(corridor):
    run_snippet("while True: pass", line_budget=100)
    assert sys.gettrace() is None
    run_level(corridor, "pawn.move(9)")
    assert sys.gettrace() is None


# -- levels: outcomes ---------------------------------------------------------------


def test_solved(corridor):
    result = run_level(corridor, "pawn.move(3)")
    assert result.status == "solved"
    assert result.summary == "Solved! You reached the goal."
    assert result.start == {"pos": [1, 0], "facing": "north", "opened": []}


def test_incomplete_says_where_the_pawn_stopped(corridor):
    result = run_level(corridor, "pawn.move()")
    assert result.status == "incomplete"
    assert result.summary == "Your program finished, but your pawn stopped on b2, and the goal is on b4."


def test_passing_through_the_goal_is_not_enough():
    level = make_level(".\nG\nP\n")
    assert run_level(level, "pawn.move(2)").status == "incomplete"


def test_say_objective():
    level = make_level("G\nP\n", objectives=["reach_goal", {"say": "Open sesame"}])
    assert run_level(level, 'pawn.move()\nprint("Open sesame")').status == "solved"
    assert run_level(level, 'print("  Open sesame  ")\npawn.move()').status == "solved"

    missing = run_level(level, "pawn.move()")
    assert missing.summary == 'Your program finished, but nobody heard the phrase "Open sesame". Use print() to say it.'

    wrong_case = run_level(level, 'pawn.move()\nprint("open sesame")')
    assert "capital letters matter" in wrong_case.summary

    both = run_level(level, "pass")
    assert both.summary.startswith("Your program finished, but your pawn stopped on a1") and " Also, nobody heard" in both.summary


def test_timeout_in_a_level(corridor):
    result = run_level(corridor, "while True:\n    pawn.turn_left()\n", line_budget=5_000)
    assert result.status == "timeout"
    assert result.truncated  # far more steps than we keep
    assert result.lines_run == 5_001


# -- levels: the step recording -----------------------------------------------------


def test_each_line_becomes_a_step_with_its_events_output_and_variables(corridor):
    code = "steps = 2\npawn.move(steps)\nprint('moved', steps)\npawn.move()\n"
    result = run_level(corridor, code)
    lines = [step["line"] for step in result.steps]
    assert lines == [1, 2, 3, 4]
    first, second, third, fourth = result.steps
    assert first["events"] == []
    assert [v for v in first["vars"] if v["name"] == "steps"] == [{"name": "steps", "value": "2", "type": "int"}]
    assert len(second["events"]) == 2
    assert third["output"] == "moved 2\n"
    assert fourth["events"][0]["state"]["pos"] == [1, 3]
    pawn = next(v for v in fourth["vars"] if v["name"] == "pawn")
    assert pawn == {"name": "pawn", "value": "pawn at b4 facing north", "type": "Pawn"}


def test_loops_record_a_step_per_iteration(corridor):
    result = run_level(corridor, "for i in range(3):\n    pawn.move()\n")
    assert [step["line"] for step in result.steps] == [1, 2, 1, 2, 1, 2, 1]
    assert [v["value"] for v in result.steps[3]["vars"] if v["name"] == "i"] == ["1"]


def test_long_values_are_shortened(corridor):
    result = run_level(corridor, "text = 'x' * 500\nnumbers = list(range(100))")
    values = {v["name"]: v["value"] for v in result.steps[-1]["vars"]}
    assert len(values["text"]) < 60
    assert values["numbers"].endswith("...]")


def test_error_step_is_the_last_step(corridor):
    result = run_level(corridor, "pawn.move()\npawn.turn_right()\npawn.move()\npawn.move()")
    assert result.steps[-1]["line"] == result.error.line == 3
    assert result.steps[-1]["events"][-1]["kind"] == "bump"


def test_sandbox_runs_finish_without_objectives():
    result = run_sandbox("pawn.move()\npawn.turn_right()", ["move", "turn_right"])
    assert result.status == "finished"
    assert result.final == {"pos": [2, 1], "facing": "east", "opened": []}


def test_sandbox_respects_the_api():
    result = run_sandbox("pawn.turn_right()", ["move"])
    assert result.error.type == "LockedAbilityError"


# -- the bridge the browser worker calls ------------------------------------------------


def test_bridge_speaks_json():
    level = {
        "id": "b", "chapter": 1, "title": "B", "trains": "t", "lesson": "b.md",
        "api": ["move"], "map": "G\nP\n",
    }  # fmt: skip
    described = json.loads(bridge.load_level(json.dumps(level)))
    assert described["ok"] and described["level"]["goal"] == [0, 1]
    assert json.loads(bridge.run_level(json.dumps(level), "pawn.move()"))["status"] == "solved"
    assert json.loads(bridge.run_sandbox("pawn.move()", '["move"]'))["status"] == "finished"
    assert json.loads(bridge.load_sandbox('["move"]'))["start"] == {"pos": [2, 0], "facing": "north", "opened": []}
    assert json.loads(bridge.run_snippet("print(1)"))["output"] == "1\n"

    broken = json.loads(bridge.load_level(json.dumps({**level, "map": "G\n"})))
    assert broken == {"ok": False, "error": "the map needs a start square (P)"}
