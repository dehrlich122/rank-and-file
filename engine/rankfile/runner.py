"""Run a player's program and report what happened.

- `run_snippet` runs plain Python with no board (the scratch harness, and
  lesson snippets that don't involve the pawn).
- `run_level` runs a program against a level. It checks the code, builds the
  world and the piece, runs the code while recording every step, and then
  decides whether the level was solved.
- `run_sandbox` is `run_level` on a small open board, for lesson snippets.

A level can have several cases (`Level.cases`): each square a hidden goal
might be on, and each other map. The code runs once for every case, and the
level only counts as solved if it solves them all. A solved run is then
scored: up to three stars (see `score`).
"""

import ast
import contextlib
import copy
import inspect
import io
import linecache
import time
from dataclasses import asdict, dataclass, field, replace

from . import codex
from .board import Tile, square_name
from .constraints import check_constraints, code_lines, lint
from .errors import ErrorInfo, explain
from .levels import NOT_JUDGED, Case, Level, names, sandbox_level
from .pieces import PIECES
from .tracer import PLAYER_FILENAME, StepBudgetExceeded, Tracer, safe_repr
from .words import and_list, count
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
class CallInfo:
    """The examiner's call on one case of an examiner level (M5.2-4b fills it in): only the facts.

    The examiner's own words about the call (decision 5), passed or failed, are the case's `summary`, as any
    run's verdict is: a case is judged in order (an error, a lost run, a problem with the function itself, the
    answer, the board) and the first failure is the summary; a call that passed has the examiner's line for it.
    A problem with the function or a wrong answer is status "incomplete"; an error raised inside the call is an
    "error", as anywhere else."""

    text: str  # the call as code writes it, "gallop(1, 3)" (levels.ExamineCall.text)
    returned: str | None  # a safe repr of what came back; None when the call didn't finish (or never started)
    wanted: str | None  # a repr of the answer wanted; None when the level judges only the board
    first_step: int  # the index in `steps` of the call's first step (len(steps) when it recorded none)


@dataclass
class LevelResult:
    # "solved", "incomplete" (ran fine, objectives not met), "finished" (a board
    # with no objectives, e.g. the sandbox), "lost" (fell into a pit or was
    # caught), "error", "timeout", or "constraint" (the code breaks the level's
    # rules, so it wasn't run).
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
    # A level with several cases (Level.cases): this result is the verdict on
    # the whole run, and `cases` holds each case's own result and recording,
    # with its `label` and board (`level`, a Level.describe()). `case` is the
    # one to show first: the first that failed, or the first if none did.
    cases: list[dict] = field(default_factory=list)
    case: int = 0
    case_note: str = ""  # the run: how many cases it worked for; a case: which one it is
    duration_ms: float = 0.0
    call: CallInfo | None = None  # on an examiner level, the call this case made (M5.2-4b); None on any other

    def to_dict(self) -> dict:
        return asdict(self)


def run_snippet(code: str, *, namespace: dict | None = None, line_budget: int = DEFAULT_LINE_BUDGET) -> SnippetResult:
    """Run `code` as a standalone program. Reuse `namespace` to keep variables between runs."""
    started = time.perf_counter()
    namespace = codex.player_namespace() if namespace is None else namespace
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
    solution_seen: bool = False,
    judge: bool = True,
) -> LevelResult:
    cases = level.cases()
    result = _run_board(cases[0].level, code, line_budget=line_budget, enforce_constraints=enforce_constraints, judge=judge)
    # Code that never ran (it broke a rule, or has a syntax error) or never
    # ended would do the same in every case, so it's reported once.
    never_ran = result.status in ("constraint", "error") and result.lines_run == 0
    if len(cases) > 1 and not never_ran and result.status != "timeout":
        # The constraints were checked on the first case; they don't change between cases.
        others = [_run_board(case.level, code, line_budget=line_budget, enforce_constraints=False) for case in cases[1:]]
        result = _whole_run(level, cases, [result, *others])
    if result.status == "solved":
        result.stars = score(level, result.code_lines, hints_used, solution_seen)
    return result


def _whole_run(level: Level, cases: list[Case], results: list[LevelResult]) -> LevelResult:
    """The verdict on a run over several cases. Each case's recording goes in
    `cases`; the verdict is the first failing case's (or the first's), without
    its recording, so nothing is sent twice."""
    recorded = []
    for case, result in zip(cases, results, strict=True):
        result.case_note = f"This run is the one {case.where}."
        recorded.append({**result.to_dict(), "label": case.label, "level": case.level.describe()})
    shown = next((index for index, result in enumerate(results) if result.status != "solved"), 0)
    passed = sum(result.status == "solved" for result in results)
    noun = level.case_words[1]
    note = f"It worked for all {len(cases)} {noun}." if passed == len(cases) else f"It worked for {passed} of the {len(cases)} {noun}."
    return replace(results[shown], steps=[], output="", cases=recorded, case=shown, case_note=note)


def _run_board(level: Level, code: str, *, line_budget: int, enforce_constraints: bool, judge: bool = True) -> LevelResult:
    """One run of `code` on one board: check it, run it, and judge the outcome."""
    started = time.perf_counter()
    world = World(level)
    piece = PIECES[level.piece](world, level.api)
    namespace = codex.player_namespace(**{level.piece: piece})
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
    warnings = [asdict(warning) for warning in lint(tree, namespace, level.examine)]
    counted = code_lines(code, tree)
    if enforce_constraints:
        problems = check_constraints(tree, code, level.constraints, level.examine)
        if problems:
            return outcome("constraint", problems[0], problems=problems, warnings=warnings, code_lines=counted)

    # 2. Run it, recording every step. (On an examiner level the examiner then calls the function: same tracer.)
    call = (level.examine.function, level.call.args) if level.examine and level.call else None
    run = execute(compiled, code, namespace, line_budget=line_budget, record=True, world=world, call=call)
    recording = {
        "steps": [asdict(step) for step in run.tracer.steps],
        "output": run.output,
        "warnings": warnings,
        "lines_run": run.tracer.lines_run,
        "code_lines": counted,
        "truncated": run.tracer.truncated,
    }
    if call is not None:
        recording["call"] = _call_info(level, run)

    # 3. Decide how it went. A loss counts even if the player's code caught it.
    if world.lost is not None:
        info = replace(explain(world.lost), traceback="")  # the game ended it, not Python
        return outcome("lost", info.friendly, error=info, **recording)
    if run.error is not None:
        info = explain(run.error, namespace)
        status = "timeout" if isinstance(run.error, StepBudgetExceeded) else "error"
        return outcome(status, info.friendly, error=info, **recording)
    if not judge or (level.nothing_to_do and call is None):
        return outcome("finished", "Finished.", **recording)
    unmet = unmet_objectives(level, world, run.output)
    facts = None
    if call is not None:  # the function, then the answer, then the board
        facts = CallFacts(level, call[0], recording["call"].text, [n for n in namespace if not n.startswith("__")], call[1],
                          run.returned, level.call.returns, run.call_output, unmet)
        failure = _call_failure(run, facts)
        if failure is not None:
            return outcome("incomplete", examiner_words(failure, facts), **recording)
    if unmet:
        return outcome("incomplete", "Your program finished, but " + " Also, ".join(unmet), **recording)
    return outcome("solved", examiner_words("passed", facts) if facts else _solved_summary(level), **recording)


def _call_info(level: Level, run: Execution) -> CallInfo:
    """The facts of the examiner's call on this case, whether or not it was judged."""
    wanted = level.call.returns
    return CallInfo(
        text=level.call.text(level.examine.function),
        returned=safe_repr(run.returned) if run.finished else None,
        wanted=None if wanted is NOT_JUDGED else repr(wanted),
        first_step=run.first_step,
    )


def _call_failure(run: Execution, facts: CallFacts) -> str | None:
    """What is wrong with the call, in the examiner's order: the function itself, then the answer. (An error or a
    lost run was judged before this, and the board is judged after.) None when the call is fine."""
    if run.problem is not None:
        return run.problem
    wanted = facts.wanted
    if wanted is not NOT_JUDGED and not (type(run.returned) is type(wanted) and run.returned == wanted):
        return "wrong_answer"  # the same kind of thing and equal: 7 is not "7", True is not 1, 1.0 is not 1
    return None


@dataclass
class CallFacts:
    """Everything the examiner's words may need about one call (M5.2-4b-2 writes them from these)."""

    level: Level
    function: str  # the function's name
    text: str  # the call as code writes it, "gallop(1, 3)"
    names: list[str]  # the names in the player's namespace (the program's and the engine's), without the dunder ones
    args: list  # the arguments the call was made with
    returned: object  # what came back (None when nothing did)
    wanted: object  # the answer wanted (NOT_JUDGED when none is)
    printed: str  # what was printed during the call
    unmet: list[str]  # the board's goals still unmet, in words


def examiner_words(kind: str, facts: CallFacts) -> str:
    """The examiner's one plain sentence for `kind` of call: "missing", "not_function", "arguments", "wrong_answer"
    or "passed". The only place these words are written; M5.2-4b-2 replaces them. (Never the answer wanted.)"""
    if kind == "missing":
        return f"The examiner looked for a function called {facts.function}, and your program doesn't define one."
    if kind == "not_function":
        return f"{facts.function} is there, but it isn't a function, so the examiner can't call it."
    if kind == "arguments":
        return f"The examiner needs to call {facts.text}, but {facts.function} can't take those arguments."
    if kind == "wrong_answer":
        return f"The examiner called {facts.text}, and it handed back {safe_repr(facts.returned)}, which is not the answer wanted."
    return _solved_summary(facts.level)


def run_sandbox(
    code: str, api: list[str], piece: str = "pawn", lesson_board: dict | None = None, call: str | None = None
) -> LevelResult:
    """Run a lesson snippet with the given abilities, on a small open board or the
    level's lesson board. Snippets have no objectives: a run just finishes (or fails, or loses).
    `call` is a snippet the examiner calls, as the lesson writes it ("gallop(1, 2)"): M5.2-5a makes the call;
    it's ignored until then."""
    return run_level(sandbox_level(api, piece, lesson_board), code, enforce_constraints=False, judge=False)


def score(level: Level, code_lines: int, hints_used: int, solution_seen: bool = False) -> list[Star]:
    """The three stars of a solved run: solving it, meeting par, and needing no help
    (no hints opened, and the solution not seen: QA-018)."""
    par = level.par.lines
    if par is None:
        par_star = Star("par", True, "Within par (this level doesn't set one)")
    elif code_lines <= par:
        par_star = Star("par", True, f"Within par: {count(par, "line")} of code or fewer")
    else:
        par_star = Star("par", False, f"Par is {count(par, "line")} of code; yours has {code_lines}")
    help_used = [f"opened {count(hints_used, 'hint')}"] if hints_used else []
    if solution_seen:
        help_used.append("looked at the solution")
    if help_used:
        hints_star = Star("no_hints", False, f"No hints or solution seen (you {' and '.join(help_used)})")
    else:
        hints_star = Star("no_hints", True, "No hints or solution seen")
    return [Star("solved", True, "Solved"), par_star, hints_star]


def unmet_objectives(level: Level, world: World, output: str) -> list[str]:
    unmet = []
    if level.objectives.reach_goal and not world.at_goal():
        unmet.append(f"your {level.piece} stopped on {square_name(world.pos)}, and the goal is on {square_name(level.goal)}.")
    missed = names([pos for pos in level.board.squares(Tile.WAYPOINT) if pos not in world.crossed])
    if missed:
        verb = "land on" if level.lands else "cross"  # a jump flies over what's between (the goal says so too)
        unmet.append(f"you didn't {verb} the {'waypoint' if len(missed) == 1 else 'waypoints'} on {and_list(missed)}.")
    captured = sum(foe.captured for foe in world.foes)
    needed = level.captures_needed()
    if captured < needed and needed == level.capturable:
        unmet.append(f"you captured {captured} of the {count(needed, 'enemy', 'enemies')} that can be taken.")
    elif captured < needed:
        unmet.append(f"you captured {captured}, and the level needs {needed}.")
    collected = world.gems_collected
    needed = level.gems_needed()
    if collected < needed:
        if level.gems == 1:
            unmet.append("you didn't collect the gem.")
        elif needed == level.gems:
            unmet.append(f"you collected {collected} of the {level.gems} gems.")
        else:
            unmet.append(f"you collected {count(collected, 'gem')}, and the level needs {needed}.")
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
    # The examiner's call (M5.2-4b), with a `call` only:
    returned: object = None  # what the call handed back (None after exit()); only meaningful when `finished`
    finished: bool = False  # the call was made and ended without an error (it handed back, or ended by exit())
    problem: str | None = None  # why it wasn't made: "missing", "not_function" or "arguments"
    first_step: int = 0  # len(tracer.steps) when the call was about to start (or, if it never was, when the run ended)
    call_output: str = ""  # what was printed during the call


def execute(
    compiled,
    source: str,
    namespace: dict,
    *,
    line_budget: int,
    record: bool = False,
    world: World | None = None,
    call: tuple[str, list] | None = None,
) -> Execution:
    """Run compiled player code under the tracer, capturing everything it prints.
    `call` is (a function's name, its arguments): once the program has ended without an error, the examiner checks
    the function and calls it with a copy of the arguments, under the same tracer, budget and captured output (M5.2-4b)."""
    remember_source(source)
    # The code's own clocks only matter when something keeps time with them.
    keeps_time = world is not None and world.code_clocked
    tracer = Tracer(line_budget, record=record, on_line=world.on_line if keeps_time else None)
    output = _StepOutput(tracer, world)
    if world is not None:
        world.listeners.append(tracer.add_event)
    error = None
    made = Execution(None, "", tracer)  # the call's facts, filled in as it goes
    reached = False  # the run got as far as the call
    printed_from = 0
    try:
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output), tracer:
            with contextlib.suppress(SystemExit):  # exit() or sys.exit(): the program chose to stop, which is fine
                exec(compiled, namespace)
            if call is not None:
                reached = True
                name, args = call
                made.problem = _function_problem(namespace, name, args)
                made.first_step = len(tracer.steps)
                if made.problem is None:
                    printed_from = len(output.getvalue())
                    with contextlib.suppress(SystemExit):  # the call chose to stop: it handed back nothing
                        made.returned = namespace[name](*copy.deepcopy(args))
                    made.finished = True
    except BaseException as exc:
        error = exc
    finally:
        output.finish_line()
        tracer.finish()
    if call is not None and not reached:
        made.first_step = len(tracer.steps)  # the program failed first
    text = output.getvalue()
    return replace(made, error=error, output=text, call_output=text[printed_from:] if reached else "")


def _function_problem(namespace: dict, name: str, args: list) -> str | None:
    """Why the examiner can't call `name(*args)`, found without calling it; None when it can: "missing" (no such
    name), "not_function" (a number, text, a class...) or "arguments" (the function can't take them)."""
    if name not in namespace:
        return "missing"
    if not inspect.isfunction(namespace[name]):
        return "not_function"
    try:
        inspect.signature(namespace[name]).bind(*args)
    except TypeError:
        return "arguments"
    return None


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
