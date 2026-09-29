"""The scratch REPL: an interactive session like typing `python` in a terminal.

Each line typed is pushed into the session. If it starts a block (a line
ending in `:`), the session waits for more lines, showing `...`, until a
blank line finishes it, just like the real Python prompt. Expressions show
their value, so typing `2 + 3` shows `5`.

Scratch Python has no board, but its session has a stand-in for the level's
piece, so `help(pawn.move)` and `dir(pawn)` work there (docs/Codex.md). Asking
it to act, or where it is, says there's no board.
"""

import codeop
from dataclasses import asdict

from . import codex
from .errors import explain
from .exceptions import NoBoardError
from .pieces import PIECES
from .runner import DEFAULT_LINE_BUDGET, execute
from .tracer import PLAYER_FILENAME


class NoBoard:
    """The stand-in piece's world: there's no board, so whatever it does or asks fails politely."""

    def __init__(self, piece: str):
        self.piece = piece

    def __getattr__(self, name: str):
        piece = self.piece
        raise NoBoardError(
            f"Scratch Python has no board, so your {piece} can't go anywhere or be anywhere here. "
            f"Try it in a lesson snippet or in your code for the level. help({piece}) shows what it knows."
        )


class Repl:
    def __init__(self):
        self.reset()

    def reset(self) -> None:
        self.namespace = codex.player_namespace()
        self.pending: list[str] = []
        self.stand_in: tuple[str, tuple[str, ...]] | None = None  # the stand-in piece: its name and abilities

    def push(self, line: str, piece: str | None = None, api: list[str] | None = None) -> dict:
        """Add one line. Returns {"more": bool, "output": str, "error": ErrorInfo-dict | None}.

        `piece` and `api` are the level's, sent with every line, so the
        stand-in follows the level and comes back after Python restarts.
        """
        self._set_stand_in(piece, api or [])
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

    def _set_stand_in(self, piece: str | None, api: list[str]) -> None:
        """Give the session a stand-in for the level's piece, unless it already has this one."""
        if piece is None or (piece, tuple(api)) == self.stand_in:
            return
        self.stand_in = (piece, tuple(api))
        self.namespace[piece] = PIECES[piece](NoBoard(piece), api)
