"""The scratch REPL: an interactive session like typing `python` in a terminal.

Each line typed is pushed into the session. If it starts a block (a line
ending in `:`), the session waits for more lines, showing `...`, until a
blank line finishes it, just like the real Python prompt. Expressions show
their value, so typing `2 + 3` shows `5`.
"""

import codeop
from dataclasses import asdict

from .errors import explain
from .runner import DEFAULT_LINE_BUDGET, execute
from .tracer import PLAYER_FILENAME


class Repl:
    def __init__(self):
        self.namespace: dict = {"__name__": "__main__"}
        self.pending: list[str] = []

    def reset(self) -> None:
        self.namespace = {"__name__": "__main__"}
        self.pending = []

    def push(self, line: str) -> dict:
        """Add one line. Returns {"more": bool, "output": str, "error": ErrorInfo-dict | None}."""
        self.pending.append(line)
        source = "\n".join(self.pending)
        try:
            # "single" mode is what the real prompt uses: it prints the value
            # of expressions. It returns None when the input is unfinished.
            compiled = codeop.compile_command(source, PLAYER_FILENAME, "single")
        except (SyntaxError, ValueError, OverflowError) as exc:
            self.pending = []
            return {"more": False, "output": "", "error": asdict(explain(exc))}
        if compiled is None:
            return {"more": True, "output": "", "error": None}

        self.pending = []
        run = execute(compiled, source, self.namespace, line_budget=DEFAULT_LINE_BUDGET)
        error = asdict(explain(run.error, self.namespace)) if run.error else None
        return {"more": False, "output": run.output, "error": error}
