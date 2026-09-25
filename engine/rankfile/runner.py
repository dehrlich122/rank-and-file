"""Run a player's program and report what happened.

`run_snippet` is the simplest runner: it executes some Python, captures what it
prints, and describes any error. The game's level runner (Milestone 1) builds
on the same pieces and adds the board, the pawn and a step-by-step recording.
"""

import contextlib
import io
import linecache
import time
import traceback
from dataclasses import asdict, dataclass

from .tracer import PLAYER_FILENAME, StepBudgetExceeded, Tracer

DEFAULT_LINE_BUDGET = 100_000


@dataclass
class ErrorInfo:
    type: str  # the exception class name, e.g. "NameError"
    message: str  # Python's own message, e.g. "name 'pwan' is not defined"
    friendly: str  # a plain-language explanation for the player
    line: int | None  # the line of the player's code that caused it
    traceback: str  # the real traceback, trimmed to the player's own code


@dataclass
class SnippetResult:
    status: str  # "ok", "error" or "timeout"
    output: str  # everything the program printed
    error: ErrorInfo | None
    lines_run: int
    duration_ms: float

    def to_dict(self) -> dict:
        return asdict(self)


def run_snippet(
    code: str,
    *,
    namespace: dict | None = None,
    line_budget: int = DEFAULT_LINE_BUDGET,
) -> SnippetResult:
    """Run `code` as a standalone program.

    Pass the same `namespace` dict again to keep variables between runs
    (that's how the scratch REPL remembers things).
    """
    if namespace is None:
        namespace = {"__name__": "__main__"}
    started = time.perf_counter()

    def finish(status: str, output: str, error: ErrorInfo | None, lines_run: int) -> SnippetResult:
        elapsed_ms = (time.perf_counter() - started) * 1000
        return SnippetResult(status, output, error, lines_run, round(elapsed_ms, 2))

    try:
        compiled = compile(code, PLAYER_FILENAME, "exec")
    except SyntaxError as exc:
        return finish("error", "", describe_error(exc), 0)

    remember_source(code)
    output = io.StringIO()
    tracer = Tracer(line_budget)
    try:
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output), tracer:
            exec(compiled, namespace)
    except StepBudgetExceeded as exc:
        return finish("timeout", output.getvalue(), describe_error(exc), tracer.lines_run)
    except Exception as exc:
        return finish("error", output.getvalue(), describe_error(exc), tracer.lines_run)
    return finish("ok", output.getvalue(), None, tracer.lines_run)


def remember_source(code: str) -> None:
    """Let tracebacks quote the player's source lines.

    Code compiled from a string has no file on disk, so we put it straight
    into linecache, the cache the traceback module reads source lines from.
    """
    linecache.cache[PLAYER_FILENAME] = (len(code), None, code.splitlines(keepends=True), PLAYER_FILENAME)


def describe_error(exc: BaseException) -> ErrorInfo:
    """Turn an exception into an ErrorInfo, keeping only the player's frames."""
    tb = traceback.TracebackException.from_exception(exc)
    _keep_player_frames(tb)
    line = _error_line(exc, tb)
    return ErrorInfo(
        type=type(exc).__name__,
        message=str(exc),
        friendly=_friendly_message(exc, line),
        line=line,
        traceback="".join(tb.format()),
    )


def _keep_player_frames(tb: traceback.TracebackException) -> None:
    """Drop engine frames so the traceback only shows code the player wrote."""
    tb.stack = traceback.StackSummary.from_list(
        [frame for frame in tb.stack if frame.filename == PLAYER_FILENAME]
    )
    for linked in (tb.__cause__, tb.__context__):
        if linked is not None:
            _keep_player_frames(linked)


def _error_line(exc: BaseException, tb: traceback.TracebackException) -> int | None:
    if isinstance(exc, SyntaxError):
        return exc.lineno
    if isinstance(exc, StepBudgetExceeded):
        return exc.line
    if tb.stack:
        return tb.stack[-1].lineno
    return None


def _friendly_message(exc: BaseException, line: int | None) -> str:
    # Milestone 1 replaces this with a full translator (errors.py). For now we
    # only special-case the endless loop, which needs the budget to explain.
    where = f" on line {line}" if line else ""
    if isinstance(exc, StepBudgetExceeded):
        return (
            f"Your program never finished. It ran more than {exc.budget:,} lines, "
            f"which almost always means a loop that never ends. It was stopped{where}."
        )
    return f"Python stopped with a {type(exc).__name__}{where}."
