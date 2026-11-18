"""Watch the player's program run, one line at a time.

Python lets us install a *trace function* with `sys.settrace`. The interpreter
calls it whenever a new frame starts (a module, a function call) and, if we ask,
before every line inside that frame. We only care about the player's own code,
which is compiled under the fake filename `<player>`, so frames from the engine
or the standard library are skipped entirely and run at full speed.

The tracer does two jobs:

1. **Counting lines.** After `budget` lines it raises `StepBudgetExceeded` from
   inside the trace function, which stops the player's program right where it
   is. That's how endless loops are caught.

2. **Recording steps** (when `record=True`). Each line of player code that runs
   becomes a *step*: the line number, the game events and printed output it
   produced, and the player's variables after it finished. The UI plays these
   steps back to animate the run.

   A line that calls the player's own function has more to do once the function
   hands back (use the answer, print it, store it). The function's lines are
   steps of their own, so when it returns normally to the player's code a
   *continuing* step is opened for the calling line, and the rest of that line
   records there. It isn't another line run: it isn't counted and ticks no clock.
"""

import reprlib
import sys
import types
from collections.abc import Callable
from dataclasses import dataclass, field

PLAYER_FILENAME = "<player>"
MAX_RECORDED_STEPS = 3_000


class StepBudgetExceeded(BaseException):
    """The player's program ran more lines than allowed (almost always an endless loop).

    It derives from BaseException, like KeyboardInterrupt, so a player's
    `except Exception:` block can't accidentally swallow it.
    """

    def __init__(self, budget: int, line: int):
        super().__init__(f"stopped after {budget:,} lines (at line {line})")
        self.budget = budget
        self.line = line


StepBudgetExceeded.__module__ = "builtins"  # so tracebacks don't show the engine's module path


@dataclass
class Step:
    line: int
    scope: str  # "<module>", or the name of the function the line is in
    events: list[dict] = field(default_factory=list)
    output: str = ""
    vars: list[dict] = field(default_factory=list)
    # Inside a function: the program's own names too (same filter and safe repr as `vars`; empty at module level),
    # and how deep the call is (0 at module level, 1 inside a function the program called, 2 inside one it called).
    globals: list[dict] = field(default_factory=list)
    depth: int = 0
    # The rest of a calling line, after a function it called returned to it: not another line run (not counted
    # in lines_run) and it ticks no clock.
    continues: bool = False


class Tracer:
    """Context manager that counts (and optionally records) the player's lines.

    Usage:
        with Tracer(budget=100_000, record=True) as tracer:
            exec(code, namespace)
        tracer.finish()
        tracer.steps      # what happened, line by line
        tracer.lines_run  # how many lines of player code ran
    """

    def __init__(
        self,
        budget: int,
        *,
        record: bool = False,
        max_steps: int = MAX_RECORDED_STEPS,
        on_line: Callable[[int], None] | None = None,
    ):
        self.budget = budget
        self.record = record
        self.on_line = on_line  # told as each player line starts (the World's line clocks)
        self.max_steps = max_steps
        self.lines_run = 0
        self.line: int | None = None  # the player's line running right now
        self.steps: list[Step] = []
        self.truncated = False  # True if the run had more steps than we keep
        self._current: Step | None = None
        self._current_frame: types.FrameType | None = None
        # A function just returned to this frame of player code: the rest of its line hasn't run yet, so no step is
        # open for it. The step opens when something happens in that line, or when the next thing starts (_open_rest).
        self._returned_to: types.FrameType | None = None
        self._returned_from: types.FrameType | None = None
        self._returned_line = 0  # the calling line: the frame may have moved on by the time the step opens

    def __enter__(self) -> Tracer:
        sys.settrace(self._on_new_frame)
        return self

    def __exit__(self, *_exc_info) -> bool:
        sys.settrace(None)
        return False  # never swallow exceptions

    # -- things that happen while a step is running --------------------------

    def add_event(self, event: dict) -> None:
        self._open_rest()
        if self._current is not None:
            self._current.events.append(event)

    def add_output(self, text: str) -> None:
        self._open_rest()
        if self._current is not None:
            self._current.output += text

    def finish(self) -> None:
        """Close the last step once the program has stopped (normally or not)."""
        self._open_rest()
        self._close_step()

    # -- the trace functions -------------------------------------------------

    def _on_new_frame(self, frame, _event, _arg):
        # Returning None means "don't trace lines in this frame".
        if frame.f_code.co_filename != PLAYER_FILENAME:
            return None
        return self._on_player_event

    def _on_player_event(self, frame, event, arg):
        if event == "line":
            self._open_rest()
            self.lines_run += 1
            self.line = frame.f_lineno
            if self.lines_run > self.budget:
                raise StepBudgetExceeded(self.budget, frame.f_lineno)
            if self.record:
                self._start_step(frame, frame.f_lineno)
            if self.on_line is not None:
                self.on_line(frame.f_lineno)
        elif event == "exception" and self._returned_to is frame:
            self._on_error_in_caller(arg[2])
        elif event == "return":
            self._on_return(frame)
        return self._on_player_event

    def _on_return(self, frame) -> None:
        self._open_rest()  # a call this frame made may have left the rest of its line pending
        if self.record and frame is self._current_frame:
            self._close_step()
        caller = frame.f_back
        if caller is not None and caller.f_code.co_filename == PLAYER_FILENAME:
            # Back in player code: the line the player sees is the caller's again. (If an exception is what left the
            # function, it reaches the caller as an "exception" event, which cancels the continuing step. The module
            # frame ending, or engine code that called the function, has no player caller.)
            self.line = caller.f_lineno
            if self.record:
                self._returned_to, self._returned_from, self._returned_line = caller, frame, caller.f_lineno

    def _on_error_in_caller(self, traceback) -> None:
        """An exception reached the frame a function just returned to. If it came out of that function, the function's
        own step is the one that raised and nothing continues. If the caller raised it afterwards (its line went on and
        failed), the line gets its step, so the last step is still the line that raised."""
        while traceback is not None and traceback.tb_frame is not self._returned_from:
            traceback = traceback.tb_next
        if traceback is None:
            self._open_rest()
        else:
            self._returned_to = self._returned_from = None

    def _open_rest(self) -> None:
        """Open the continuing step for a calling line, if a function just handed back to it."""
        caller, self._returned_to, self._returned_from = self._returned_to, None, None
        if caller is not None:
            self._start_step(caller, self._returned_line, continues=True)

    def _start_step(self, frame, line: int, continues: bool = False) -> None:
        self._close_step()
        if len(self.steps) >= self.max_steps:
            self.truncated = True
            return
        self._current = Step(line=line, scope=frame.f_code.co_name, depth=_depth(frame), continues=continues)
        self._current_frame = frame
        self.steps.append(self._current)

    def _close_step(self) -> None:
        # The step's variables are captured when it ends, so they show the
        # effect of the line that just ran.
        if self._current is not None and self._current_frame is not None:
            self._current.vars = snapshot_vars(self._current_frame)
            if self._current.depth:  # inside a function: the program's own names are out of its sight
                self._current.globals = snapshot_globals(self._current_frame)
        self._current = None
        self._current_frame = None


def _depth(frame) -> int:
    """How many of the player's functions are running, counting `frame`'s own (0 at module level)."""
    depth = 0
    while frame is not None:
        if frame.f_code.co_filename == PLAYER_FILENAME and frame.f_code.co_name != "<module>":
            depth += 1
        frame = frame.f_back
    return depth


_short = reprlib.Repr(maxstring=48, maxother=48, maxlist=8, maxtuple=8, maxdict=6, maxset=6, maxlevel=3)


def snapshot_vars(frame) -> list[dict]:
    """The player's variables in `frame`, as short, safe descriptions."""
    return _describe(frame.f_locals)


def snapshot_globals(frame) -> list[dict]:
    """The program's own names (the namespace `frame`'s function was made in), described the same way."""
    return _describe(frame.f_globals)


def _describe(names: dict) -> list[dict]:
    snapshot = []
    for name, value in list(names.items()):
        if name.startswith("__") or isinstance(value, types.ModuleType):
            continue
        snapshot.append({"name": name, "value": safe_repr(value), "type": type(value).__name__})
    return snapshot


def safe_repr(value) -> str:
    if isinstance(value, (types.FunctionType, type)):
        kind = "class" if isinstance(value, type) else "function"
        return f"{kind} {value.__name__}"
    try:
        return _short.repr(value)
    except Exception:
        return f"<{type(value).__name__}>"
