import json
import time

from rankfile import bridge
from rankfile.runner import run_snippet


def test_captures_printed_output():
    result = run_snippet('print("hello")\nprint(1 + 2)')
    assert result.status == "ok"
    assert result.output == "hello\n3\n"
    assert result.error is None
    assert result.lines_run == 2


def test_counts_every_line_executed_in_a_loop():
    result = run_snippet("for i in range(3):\n    x = i\n")
    assert result.status == "ok"
    # the `for` line is revisited on every iteration, plus once to finish
    assert result.lines_run == 7


def test_syntax_error_reports_the_line():
    result = run_snippet('print("ok")\nprint("oops"\n')
    assert result.status == "error"
    assert result.error.type == "SyntaxError"
    assert result.error.line == 2
    assert result.lines_run == 0


def test_runtime_error_reports_line_and_keeps_output_so_far():
    result = run_snippet('print("before")\npwan = 1\nprint(pawn)\n')
    assert result.status == "error"
    assert result.output == "before\n"
    assert result.error.type == "NameError"
    assert result.error.line == 3
    assert "pawn" in result.error.message


def test_traceback_shows_only_player_code():
    result = run_snippet("def f():\n    return 1 / 0\n\nf()\n")
    tb = result.error.traceback
    assert 'File "<player>", line 4' in tb
    assert 'File "<player>", line 2' in tb
    assert "return 1 / 0" in tb  # source lines are quoted
    assert "runner.py" not in tb
    assert tb.rstrip().endswith("ZeroDivisionError: division by zero")


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
    result = run_snippet(code, line_budget=1_000)
    assert result.status == "timeout"


def test_namespace_can_be_reused_between_runs():
    namespace = {"__name__": "__main__"}
    run_snippet("gold = 5", namespace=namespace)
    result = run_snippet("print(gold * 2)", namespace=namespace)
    assert result.output == "10\n"


def test_tracing_is_switched_off_afterwards():
    import sys

    run_snippet("x = 1")
    assert sys.gettrace() is None
    run_snippet("while True: pass", line_budget=100)
    assert sys.gettrace() is None


def test_bridge_returns_json():
    payload = json.loads(bridge.run_snippet('print("hi")'))
    assert payload["status"] == "ok"
    assert payload["output"] == "hi\n"
    assert payload["error"] is None
