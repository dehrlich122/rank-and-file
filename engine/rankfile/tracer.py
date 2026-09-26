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
"""

import reprlib
import sys
import types
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


class Tracer:
    """Context manager that counts (and optionally records) the player's lines.

    Usage:
        with Tracer(budget=100_000, record=True) as tracer:
            exec(code, namespace)
        tracer.finish()
        tracer.steps      # what happened, line by line
        tracer.lines_run  # how many lines of player code ran
    """

    def __init__(self, budget: int, *, record: bool = False, max_steps: int = MAX_RECORDED_STEPS):
        self.budget = budget
        self.record = record
        self.max_steps = max_steps
        self.lines_run = 0
        self.line: int | None = None  # the player's line running right now
        self.steps: list[Step] = []
        self.truncated = False  # True if the run had more steps than we keep
        self._current: Step | None = None
        self._current_frame: types.FrameType | None = None

    def __enter__(self) -> Tracer:
        sys.settrace(self._on_new_frame)
        return self

    def __exit__(self, *_exc_info) -> bool:
        sys.settrace(None)
        return False  # never swallow exceptions

    # -- things that happen while a step is running --------------------------

    def add_event(self, event: dict) -> None:
        if self._current is not None:
            self._current.events.append(event)

    def add_output(self, text: str) -> None:
        if self._current is not None:
            self._current.output += text

    def finish(self) -> None:
        """Close the last step once the program has stopped (normally or not)."""
        self._close_step()

    # -- the trace functions -------------------------------------------------

    def _on_new_frame(self, frame, _event, _arg):
        # Returning None means "don't trace lines in this frame".
        if frame.f_code.co_filename != PLAYER_FILENAME:
            return None
        return self._on_player_event

    def _on_player_event(self, frame, event, _arg):
        if event == "line":
            self.lines_run += 1
            self.line = frame.f_lineno
            if self.lines_run > self.budget:
                raise StepBudgetExceeded(self.budget, frame.f_lineno)
            if self.record:
                self._start_step(frame)
        elif event == "return" and self.record and frame is self._current_frame:
            self._close_step()
        return self._on_player_event

    def _start_step(self, frame) -> None:
        self._close_step()
        if len(self.steps) >= self.max_steps:
            self.truncated = True
            return
        self._current = Step(line=frame.f_lineno, scope=frame.f_code.co_name)
        self._current_frame = frame
        self.steps.append(self._current)

    def _close_step(self) -> None:
        # The step's variables are captured when it ends, so they show the
        # effect of the line that just ran.
        if self._current is not None and self._current_frame is not None:
            self._current.vars = snapshot_vars(self._current_frame)
        self._current = None
        self._current_frame = None


_short = reprlib.Repr(maxstring=48, maxother=48, maxlist=8, maxtuple=8, maxdict=6, maxset=6, maxlevel=3)


def snapshot_vars(frame) -> list[dict]:
    """The player's variables in `frame`, as short, safe descriptions."""
    snapshot = []
    for name, value in list(frame.f_locals.items()):
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
