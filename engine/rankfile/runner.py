"""Run a player's program and report what happened.

- `run_snippet` runs plain Python with no board (the scratch harness, and
  lesson snippets that don't involve the pawn).
- `run_level` runs a program against a level. It checks the code, builds the
  world and the piece, runs the code while recording every step, and then
  decides whether the level was solved.
- `run_sandbox` is `run_level` on a small open board, for lesson snippets.

A level can have hidden boards (`Level.variants`). Once the visible board is
solved, the same code runs on each hidden one, and the level only counts as
solved if every board is. A solved run is then scored: up to three stars
(see `score`).
"""

import ast
import contextlib
import io
import linecache
import time
from dataclasses import asdict, dataclass, field

from .board import square_name
from .constraints import check_constraints, code_lines, lint
from .errors import ErrorInfo, explain
from .levels import Level, sandbox_level
from .pieces import PIECES
from .tracer import PLAYER_FILENAME, StepBudgetExceeded, Tracer
from .words import count
from .world import World

DEFAULT_LINE_BUDGET = 100_000


@dataclass
class SnippetResult:
    status: str  # "ok", "error" or "timeout"
    output: str  # everything the program printed
    error: ErrorInfo | None
    lines_run: int
    duration_ms: float

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class Star:
    kind: str  # "solved", "par" or "no_hints"
    earned: bool
    label: str  # what it's for, in words, e.g. "Within par: 3 lines of code or fewer"


@dataclass
class LevelResult:
    # "solved", "incomplete" (ran fine, objectives not met), "finished" (a board
    # with no objectives, e.g. the sandbox), "error", "timeout", or "constraint"
    # (the code breaks the level's rules, so it wasn't run).
    status: str
    summary: str  # one or two sentences for the player
    start: dict  # the piece's state before the run
    final: dict  # ...and after it
    steps: list[dict] = field(default_factory=list)
    output: str = ""
    error: ErrorInfo | None = None
    problems: list[str] = field(default_factory=list)  # broken constraints
    warnings: list[dict] = field(default_factory=list)  # {line, message}
    lines_run: int = 0
    code_lines: int = 0
    truncated: bool = False  # the run had more steps than were recorded
    stars: list[Star] = field(default_factory=list)  # only for a solved run
    # Set when the visible board was solved but a hidden one wasn't: this
    # result is that board's run. {index, total, note, level: Level.describe()}
    hidden_board: dict | None = None
    duration_ms: float = 0.0

    def to_dict(self) -> dict:
        return asdict(self)


def run_snippet(code: str, *, namespace: dict | None = None, line_budget: int = DEFAULT_LINE_BUDGET) -> SnippetResult:
    """Run `code` as a standalone program. Reuse `namespace` to keep variables between runs."""
    started = time.perf_counter()
    namespace = {"__name__": "__main__"} if namespace is None else namespace
    try:
        compiled = compile(code, PLAYER_FILENAME, "exec")
    except (SyntaxError, ValueError) as exc:
        return SnippetResult("error", "", explain(exc), 0, _ms_since(started))
    run = execute(compiled, code, namespace, line_budget=line_budget)
    if run.error is None:
        return SnippetResult("ok", run.output, None, run.tracer.lines_run, _ms_since(started))
    status = "timeout" if isinstance(run.error, StepBudgetExceeded) else "error"
    return SnippetResult(status, run.output, explain(run.error, namespace), run.tracer.lines_run, _ms_since(started))


def run_level(
    level: Level,
    code: str,
    *,
    line_budget: int = DEFAULT_LINE_BUDGET,
    enforce_constraints: bool = True,
    hints_used: int = 0,
) -> LevelResult:
    result = _run_board(level, code, line_budget=line_budget, enforce_constraints=enforce_constraints)
    if result.status != "solved":
        return result
    total = len(level.variants)
    for index, hidden in enumerate(level.variants, start=1):
        # The code already passed the constraints on the visible board.
        attempt = _run_board(hidden, code, line_budget=line_budget, enforce_constraints=False)
        if attempt.status != "solved":
            note = f"Your code solved the board you can see, but not hidden board {index} of {total}. This is its run."
            attempt.hidden_board = {"index": index, "total": total, "note": note, "level": hidden.describe()}
            return attempt
    if total:
        boards = "the hidden board" if total == 1 else f"all {total} hidden boards"
        result.summary += f" It solved {boards} too."
    result.stars = score(level, result.code_lines, hints_used)
    return result


def _run_board(level: Level, code: str, *, line_budget: int, enforce_constraints: bool) -> LevelResult:
    """One run of `code` on one board: check it, run it, and judge the outcome."""
    started = time.perf_counter()
    world = World(level)
    piece = PIECES[level.piece](world, level.api)
    namespace = {"__name__": "__main__", level.piece: piece}
    start = world.state()

    def outcome(status: str, summary: str, **details) -> LevelResult:
        return LevelResult(status, summary, start, world.state(), duration_ms=_ms_since(started), **details)

    # 1. Check the code before running it.
    try:
        tree = ast.parse(code, PLAYER_FILENAME)
        compiled = compile(tree, PLAYER_FILENAME, "exec")
    except (SyntaxError, ValueError) as exc:
        info = explain(exc)
        return outcome("error", info.friendly, error=info)
    warnings = [asdict(warning) for warning in lint(tree, namespace)]
    counted = code_lines(code)
    if enforce_constraints:
        problems = check_constraints(tree, code, level.constraints)
        if problems:
            return outcome("constraint", problems[0], problems=problems, warnings=warnings, code_lines=counted)

    # 2. Run it, recording every step.
    run = execute(compiled, code, namespace, line_budget=line_budget, record=True, world=world)
    recording = {
        "steps": [asdict(step) for step in run.tracer.steps],
        "output": run.output,
        "warnings": warnings,
        "lines_run": run.tracer.lines_run,
        "code_lines": counted,
        "truncated": run.tracer.truncated,
    }

    # 3. Decide how it went.
    if run.error is not None:
        info = explain(run.error, namespace)
        status = "timeout" if isinstance(run.error, StepBudgetExceeded) else "error"
        return outcome(status, info.friendly, error=info, **recording)
    if not level.objectives.reach_goal and not level.objectives.say:
        return outcome("finished", "Finished.", **recording)
    unmet = unmet_objectives(level, world, run.output)
    if unmet:
        return outcome("incomplete", "Your program finished, but " + " Also, ".join(unmet), **recording)
    return outcome("solved", _solved_summary(level), **recording)


def run_sandbox(code: str, api: list[str], piece: str = "pawn") -> LevelResult:
    """Run a lesson snippet on a small open board with the given abilities."""
    return run_level(sandbox_level(api, piece), code, enforce_constraints=False)


def score(level: Level, code_lines: int, hints_used: int) -> list[Star]:
    """The three stars of a solved run: solving it, meeting par, and using no hints."""
    par = level.par.lines
    if par is None:
        par_star = Star("par", True, "Within par (this level doesn't set one)")
    elif code_lines <= par:
        par_star = Star("par", True, f"Within par: {count(par, "line")} of code or fewer")
    else:
        par_star = Star("par", False, f"Par is {count(par, "line")} of code; yours has {code_lines}")
    if hints_used == 0:
        hints_star = Star("no_hints", True, "No hints opened")
    else:
        hints_star = Star("no_hints", False, f"No hints opened (you opened {hints_used})")
    return [Star("solved", True, "Solved"), par_star, hints_star]


def unmet_objectives(level: Level, world: World, output: str) -> list[str]:
    unmet = []
    if level.objectives.reach_goal and not world.at_goal():
        unmet.append(f"your {level.piece} stopped on {square_name(world.pos)}, and the goal is on {square_name(level.goal)}.")
    printed = [line.strip() for line in output.splitlines()]
    for phrase in level.objectives.say:
        if phrase in printed:
            continue
        if phrase.casefold() in (line.casefold() for line in printed):
            unmet.append(f'you printed the phrase, but not exactly: capital letters matter. It should be "{phrase}".')
        else:
            unmet.append(f'nobody heard the phrase "{phrase}". Use print() to say it.')
    return unmet


# -- running code --------------------------------------------------------------


@dataclass
class Execution:
    error: BaseException | None  # None if the program ran to the end
    output: str
    tracer: Tracer


def execute(
    compiled,
    source: str,
    namespace: dict,
    *,
    line_budget: int,
    record: bool = False,
    world: World | None = None,
) -> Execution:
    """Run compiled player code under the tracer, capturing everything it prints."""
    remember_source(source)
    tracer = Tracer(line_budget, record=record)
    output = _StepOutput(tracer, world)
    if world is not None:
        world.listeners.append(tracer.add_event)
    error = None
    try:
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output), tracer:
            exec(compiled, namespace)
    except SystemExit:
        pass  # exit() or sys.exit(): the program chose to stop, which is fine
    except BaseException as exc:
        error = exc
    finally:
        output.finish_line()
        tracer.finish()
    return Execution(error, output.getvalue(), tracer)


def remember_source(code: str) -> None:
    """Let tracebacks quote the player's source lines.

    Code compiled from a string has no file on disk, so we put it straight
    into linecache, the cache the traceback module reads source lines from.
    """
    linecache.cache[PLAYER_FILENAME] = (len(code), None, code.splitlines(keepends=True), PLAYER_FILENAME)


class _StepOutput(io.StringIO):
    """Collects everything printed, tells the tracer which step printed it, and
    lets the world hear each finished line (that's how gates listen)."""

    def __init__(self, tracer: Tracer, world: World | None = None):
        super().__init__()
        self._tracer = tracer
        self._world = world
        self._line = ""  # the line being printed, until its newline arrives

    def write(self, text: str) -> int:
        self._tracer.add_output(text)
        written = super().write(text)
        if self._world is not None:
            *finished, self._line = (self._line + text).split("\n")
            for line in finished:
                self._world.hear(line, printed_on=self._tracer.line)
        return written

    def finish_line(self) -> None:
        """The program stopped: a last line printed without a newline still counts."""
        if self._world is not None and self._line:
            self._world.hear(self._line, printed_on=self._tracer.line)
        self._line = ""


def _solved_summary(level: Level) -> str:
    if level.objectives.reach_goal and level.objectives.say:
        return "Solved! You reached the goal and said the phrase."
    if level.objectives.reach_goal:
        return "Solved! You reached the goal."
    return "Solved!"


def _ms_since(started: float) -> float:
    return round((time.perf_counter() - started) * 1000, 2)
