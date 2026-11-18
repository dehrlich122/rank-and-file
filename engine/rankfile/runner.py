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
import types
from dataclasses import asdict, dataclass, field, replace

from . import codex
from .board import Tile, square_name
from .constraints import check_constraints, code_lines, lint
from .errors import ErrorInfo, _kind, closest, explain
from .levels import NOT_JUDGED, Case, Examine, ExamineCall, Level, names, sandbox_level
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
    if call is not None and not judge:  # a lesson's snippet: only the call itself is looked at (M5.2-5a)
        facts = _call_facts(level, recording["call"].text, namespace, run, [])
        if run.problem is not None:
            return outcome("incomplete", examiner_words(run.problem, facts), **recording)
        return outcome("finished", _called_words(facts), **recording)
    if not judge or (level.nothing_to_do and call is None):
        return outcome("finished", "Finished.", **recording)
    unmet = unmet_objectives(level, world, run.output)
    if call is not None:  # the function, then the answer, then the board
        facts = _call_facts(level, recording["call"].text, namespace, run, unmet)
        kind = _call_failure(run, facts) or _call_ending(facts)
        return outcome("solved" if kind in PASSED else "incomplete", examiner_words(kind, facts), **recording)
    if unmet:
        return outcome("incomplete", "Your program finished, but " + " Also, ".join(unmet), **recording)
    return outcome("solved", _solved_summary(level), **recording)


def _call_facts(level: Level, text: str, namespace: dict, run: Execution, unmet: list[str]) -> CallFacts:
    """What the examiner's words may need about the call this run made."""
    function, args = level.examine.function, level.call.args
    return CallFacts(
        function, text, namespace.get(function), _own_functions(namespace), args, run.returned,
        level.call.returns, run.call_output, unmet, run.signature,
    )  # fmt: skip


def _called_words(facts: CallFacts) -> str:
    """A snippet's summary when the examiner made the call and nothing was judged."""
    called = f"The examiner called `{facts.text}`"
    return f"{called}." if facts.returned is None else f"{called} and got {safe_repr(facts.returned)} back."


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
    lost run was judged before this, and the board is judged after.) The kind of the examiner's words, or None when
    the call is fine."""
    if run.problem is not None:
        return run.problem  # "missing", "not_function" or "arguments"
    wanted, got = facts.wanted, facts.returned
    if wanted is NOT_JUDGED or (type(got) is type(wanted) and got == wanted):
        return None  # the same kind of thing and equal: 7 is not "7", True is not 1, 1.0 is not 1
    if got is None:  # "printed" only when one of the lines printed in the call is the answer
        return "printed" if any(line.strip() == str(wanted) for line in facts.printed.splitlines()) else "nothing"
    if wanted is None:
        return "unexpected"
    return "wrong_value" if type(got) is type(wanted) else "wrong_kind"


PASSED = ("passed", "passed_answered")


def _call_ending(facts: CallFacts) -> str:
    """The call was fine, so the board decides: the kind of the words for its goals met or not, and whether an
    answer was judged on the way."""
    judged = facts.wanted is not NOT_JUDGED
    if facts.unmet:
        return "board_answered" if judged else "board"
    return "passed_answered" if judged else "passed"


def _own_functions(namespace: dict) -> list[str]:
    """The names of the functions the player wrote (not the engine's)."""
    return [name for name, value in namespace.items() if inspect.isfunction(value) and value.__code__.co_filename == PLAYER_FILENAME]


@dataclass
class CallFacts:
    """Everything the examiner's words may need about one call."""

    function: str  # the function's name
    text: str  # the call as code writes it, "gallop(1, 3)"
    found: object  # what the program calls that name (None when nothing)
    own: list[str]  # the names of the functions the player wrote
    args: list  # the arguments the call was made with
    returned: object  # what came back (None when nothing did)
    wanted: object  # the answer wanted (NOT_JUDGED when none is)
    printed: str  # what was printed during the call
    unmet: list[str]  # the board's goals still unmet, in words
    signature: inspect.Signature | None = None  # the function's own parameters, when the examiner could read them


# The examiner's line for each kind of words, in quotes after what happened. (Reachable apart from the rest.)
_LINES = {
    "passed": "Correct. I had rather hoped to be disappointed.",
    "missing": "I called. Nobody answered to that name.",
    "not_function": "I can call a function. I cannot call that.",
    "arguments": "I hand over what the task says: no more, no fewer.",
    "printed": "You showed me the answer. I asked you to hand it to me.",
    "nothing": "I held out my hand, and nothing was put in it.",
    "wrong_value": "An answer, certainly. Not the answer.",
    "wrong_kind": "The right idea in the wrong kind of thing is still the wrong thing.",
    "board": "The call ended. The task had not.",
    "board_answered": "The answer is not the whole of the task.",
}
_LINES["passed_answered"] = _LINES["passed"]
_LINES["unexpected"] = _LINES["wrong_value"]


def examiner_line(kind: str) -> str:
    """What the examiner says for `kind` of words (without the quotes)."""
    return _LINES[kind]


def examiner_words(kind: str, facts: CallFacts) -> str:
    """A case's whole summary: what happened, then the examiner's line in curly quotes. `kind` is "passed",
    "passed_answered", "missing", "not_function", "arguments", "printed", "nothing", "wrong_value", "wrong_kind",
    "unexpected", "board" or "board_answered"."""
    return f"{what_happened(kind, facts)} “{examiner_line(kind)}”"


def what_happened(kind: str, facts: CallFacts) -> str:
    """The first part of the words: what the examiner did and found, in plain sentences. The answer wanted shows
    only where the examiner has judged one and the function was called."""
    called, name = f"The examiner called `{facts.text}`", facts.function
    if kind == "passed":
        return f"{called}, and the board is as it should be."
    if kind == "passed_answered":
        return f"{called}: it wanted {facts.wanted!r} and got {safe_repr(facts.returned)}."
    if kind == "missing":
        near = closest(name, facts.own)
        tail = f"It has `{near}`: the examiner needs the name letter for letter." if near else f"Define it with `def {name}(...):`."
        return f"{called}, and your program has no function called `{name}`. {tail}"
    if kind == "not_function":
        return f"{called}, but `{name}` in your program is {_what_it_is(facts.found)}, not a function. Keep that name for the `def`."
    if kind == "arguments":
        return f"{called}{_with_values(len(facts.args))}, and {_what_it_takes(facts.found, facts.signature, len(facts.args))}"
    if kind == "board":
        return f"{called}, and when the call ended " + " Also, ".join(facts.unmet)
    if kind == "board_answered":
        return f"{called} and got the {facts.wanted!r} it wanted, but when the call ended " + " Also, ".join(facts.unmet)
    wanted = "nothing back (None)" if facts.wanted is None else repr(facts.wanted)
    if kind in ("printed", "nothing"):
        got = f"{called} and got nothing back (None); it wanted {wanted}."
        if kind == "printed":
            return f"{got} Your function printed its answer, but the examiner doesn't read the screen: `print` shows a value, `return` hands it back."
        return f"{got} A function hands a value back only with `return`: check that every way through `{name}` reaches one."
    got = f"{called}: it wanted {wanted} and got {safe_repr(facts.returned)}"
    if kind == "wrong_kind":
        return f"{got}, which is {_kind(type(facts.returned).__name__)}, not {_kind(type(facts.wanted).__name__)}."
    return got + "."


def _what_it_is(value: object) -> str:
    """A value that was meant to be a function, as the examiner says it: "3, a whole number (an int)"; "a class"."""
    if isinstance(value, type):
        return "a class"
    shown, kind = safe_repr(value), _kind(type(value).__name__)
    return shown if shown == kind else f"{shown}, {kind}"


def _with_values(n: int) -> str:
    return " with no values" if n == 0 else f" with {count(n, 'value')}"


def _what_it_takes(function: object, signature: inspect.Signature | None, given: int) -> str:
    """"your `gallop` takes 1." and what to do about it, for a function that can't take `given` values.
    `signature` is the one `execute` read when it checked the call."""
    parameters = (signature or inspect.Signature()).parameters.values()
    positional = [p for p in parameters if p.kind in (p.POSITIONAL_ONLY, p.POSITIONAL_OR_KEYWORD)]
    least = sum(p.default is p.empty for p in positional)
    most = None if any(p.kind is p.VAR_POSITIONAL for p in parameters) else len(positional)
    mine = f"your `{function.__name__}`"
    if given >= least and (most is None or given <= most):  # the count fits: only a name that can't be given by position is left
        by_name = [f"`{p.name}`" for p in parameters if p.kind is p.KEYWORD_ONLY and p.default is p.empty]
        one = len(by_name) == 1
        return (
            f"{mine} also needs {and_list(by_name)}, which can only be given by name. "
            + ("Take it before the `*` in its `def` line, or give it a default value." if one else
               "Take them before the `*` in its `def` line, or give each one a default value.")
        )
    if most is None:
        takes = f"{least} or more"
    elif most == 0:
        takes = "none"
    elif least == most:
        takes = str(most)
    elif least == 0:
        takes = "none or 1" if most == 1 else f"up to {most}"
    else:
        takes = f"{least} or {most}" if most == least + 1 else f"from {least} to {most}"
    return f"{mine} takes {takes}. Each value needs a name inside the parentheses of its `def` line."


def run_sandbox(
    code: str, api: list[str], piece: str = "pawn", lesson_board: dict | None = None, call: str | None = None
) -> LevelResult:
    """Run a lesson snippet with the given abilities, on a small open board or the
    level's lesson board. Snippets have no objectives: a run just finishes (or fails, or loses).
    `call` (M5.2-5a) is the call the examiner makes after the program, as the lesson writes it ("gallop(1, 2)"): a
    program that only defines, like an examiner level's. It is made the examiner's way, on a sandbox level that
    carries the examiner and that one call, and isn't judged: a run that ends well says what was called and got back,
    and a function the examiner can't call is `incomplete`, in the examiner's words. The text is a lesson author's:
    one that isn't a plain call raises ValueError, for the level checker, never for a player."""
    level = sandbox_level(api, piece, lesson_board)
    if call:
        name, args = parse_snippet_call(call)
        level = replace(level, examine=Examine(name, [ExamineCall(args)]), call=ExamineCall(args))
    return run_level(level, code, enforce_constraints=False, judge=False)


def parse_snippet_call(text: str) -> tuple[str, list]:
    """The function's name and the values of a lesson's `calls` text: one call of a plain name with plain values."""
    problem = ValueError(
        f"The lesson's call {text!r} must be one call of a plain function name with plain values, "
        "like gallop(1, 2): numbers, text, True, False or None."
    )
    try:
        call = ast.parse(text.strip(), mode="eval").body
    except (SyntaxError, ValueError):
        raise problem from None
    if not (isinstance(call, ast.Call) and isinstance(call.func, ast.Name) and not call.keywords):
        raise problem
    args = []
    for arg in call.args:
        negative = isinstance(arg, ast.UnaryOp) and isinstance(arg.op, ast.USub)
        value = arg.operand if negative else arg
        if not isinstance(value, ast.Constant):
            raise problem
        plain = value.value
        if negative and (type(plain) not in (int, float)):
            raise problem
        if not negative and not (plain is None or type(plain) in (bool, int, float, str)):
            raise problem
        args.append(-plain if negative else plain)
    return call.func.id, args


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
    signature: inspect.Signature | None = None  # the function's own parameters, read when the call was checked
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
                made.first_step = len(tracer.steps)  # before the check, so it is right whenever the call is not made
                made.problem, made.signature = _function_problem(namespace, name, args)
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


def _function_problem(namespace: dict, name: str, args: list) -> tuple[str | None, inspect.Signature | None]:
    """Why the examiner can't call `name(*args)`, found without calling it, and the function's signature (read once,
    for the words). The problem is None when the call can be made: "missing" (no such name), "not_function" (a number,
    text, a class...) or "arguments" (the function can't take them)."""
    if name not in namespace:
        return "missing", None
    if not inspect.isfunction(namespace[name]):
        return "not_function", None
    signature = _own_signature(namespace[name])
    if signature is None:
        return None, None  # can't read it: let the call itself say
    try:
        signature.bind(*args)
    except TypeError:
        return "arguments", signature
    return None, signature


def _own_signature(function) -> inspect.Signature | None:
    """The parameters a call to `function` meets, read from its own code, defaults and keyword defaults, never from
    its `__wrapped__` or `__signature__` (a program can set either to anything, and `inspect.signature` follows both).
    A bare copy of the function, built from those three parts, has neither attribute. None if it can't be read."""
    try:
        bare = types.FunctionType(function.__code__, {}, function.__name__, function.__defaults__, function.__closure__)
        bare.__kwdefaults__ = function.__kwdefaults__
        return inspect.signature(bare)
    except Exception:
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
