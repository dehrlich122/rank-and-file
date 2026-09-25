"""The game world: where the piece is, and everything that happens to it.

Every change is announced as an *event*: a small dict such as
{"kind": "move", "state": {"pos": [2, 3], "facing": "north"}}. Events carry the
piece's state *after* they happened, so the UI can show any moment of a run
by drawing that state. That's what makes step-back and rewind cheap.
"""

from collections.abc import Callable
from typing import TYPE_CHECKING

from .board import Tile, square_name, step
from .exceptions import BlockedError

if TYPE_CHECKING:
    from .levels import Level

Event = dict


class World:
    def __init__(self, level: "Level"):
        self.level = level
        self.board = level.board
        self.pos = level.start
        self.facing = level.facing
        self.listeners: list[Callable[[Event], None]] = []

    def state(self) -> dict:
        return {"pos": list(self.pos), "facing": self.facing.value}

    def move_forward(self) -> None:
        target = step(self.pos, self.facing)
        if self.board.blocked(target):
            self._emit("bump", at=list(target))
            raise BlockedError(self._bump_message(target), at=target)
        self.pos = target
        self._emit("move")

    def turn_left(self) -> None:
        self.facing = self.facing.turned_left()
        self._emit("turn")

    def turn_right(self) -> None:
        self.facing = self.facing.turned_right()
        self._emit("turn")

    def _emit(self, kind: str, **details) -> None:
        event = {"kind": kind, "state": self.state(), **details}
        for listener in self.listeners:
            listener(event)

    def _bump_message(self, target) -> str:
        piece = self.level.piece
        here = square_name(self.pos)
        if not self.board.contains(target):
            return f"Your {piece} can't walk off the edge of the board. It's on {here}, facing {self.facing.value}."
        what = "a signpost" if self.board.tile(target) is Tile.SIGN else "a wall"
        return f"Your {piece} bumped into {what} on {square_name(target)}."
