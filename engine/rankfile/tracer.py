"""Watch the player's program run, one line at a time.

Python lets us install a *trace function* with `sys.settrace`. The interpreter
calls it whenever a new frame starts (a module, a function call) and, if we ask,
before every line inside that frame. We only care about the player's own code,
which is compiled under the fake filename `<player>`, so frames from the engine
or the standard library are skipped entirely and run at full speed.

Counting lines gives us a cheap way to stop programs that never end: after
`budget` lines we raise `StepBudgetExceeded` from inside the trace function,
which unwinds the player's program right where it is.
"""

import sys

PLAYER_FILENAME = "<player>"


class StepBudgetExceeded(BaseException):
    """The player's program ran more lines than allowed (almost always an endless loop).

    It derives from BaseException, like KeyboardInterrupt, so a player's
    `except Exception:` block can't accidentally swallow it.
    """

    def __init__(self, budget: int, line: int):
        super().__init__(f"stopped after {budget:,} lines (at line {line})")
        self.budget = budget
        self.line = line


class Tracer:
    """Context manager that counts the player's lines and enforces the budget.

    Usage:
        with Tracer(budget=100_000) as tracer:
            exec(code, namespace)
        tracer.lines_run  # how many lines of player code ran
    """

    def __init__(self, budget: int):
        self.budget = budget
        self.lines_run = 0

    def __enter__(self) -> "Tracer":
        sys.settrace(self._on_new_frame)
        return self

    def __exit__(self, *exc_info) -> bool:
        sys.settrace(None)
        return False  # never swallow exceptions

    def _on_new_frame(self, frame, event, arg):
        # Returning None means "don't trace lines in this frame".
        if frame.f_code.co_filename != PLAYER_FILENAME:
            return None
        return self._on_player_event

    def _on_player_event(self, frame, event, arg):
        if event == "line":
            self.lines_run += 1
            if self.lines_run > self.budget:
                raise StepBudgetExceeded(self.budget, frame.f_lineno)
        return self._on_player_event
