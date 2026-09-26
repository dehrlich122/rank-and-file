"""The game world: where the piece is, and everything that happens to it.

Every change is announced as an *event*: a small dict such as
{"kind": "move", "state": {"pos": [2, 3], "facing": "north", "opened": []}}.
Events carry the whole world's state *after* they happened (the piece, and
which gates are open), so the UI can show any moment of a run by drawing that
state. That's what makes step-back and rewind cheap.
"""

from collections.abc import Callable
from typing import TYPE_CHECKING

from .board import Pos, Tile, square_name, step
from .exceptions import BlockedError, GateLockedError

if TYPE_CHECKING:
    from .levels import Level

Event = dict

# What the guard at a locked gate says. Every level with a gate shares these.
GUARD_WRONG_PHRASE = "The guard called your mother a hamster! The gate remains locked."
GUARD_GATE_LOCKED = "Does your father really smell of elderberries? Maybe try the passphrase first."


class World:
    def __init__(self, level: "Level"):
        self.level = level
        self.board = level.board
        self.pos = level.start
        self.facing = level.facing
        self.opened: set[Pos] = set()  # gates that have heard their passphrase
        self.listeners: list[Callable[[Event], None]] = []

    def state(self) -> dict:
        return {"pos": list(self.pos), "facing": self.facing.value, "opened": [list(pos) for pos in sorted(self.opened)]}

    def move_forward(self) -> None:
        target = step(self.pos, self.facing)
        if self.board.blocked(target):
            self._emit("bump", at=list(target))
            raise BlockedError(self._bump_message(target), at=target)
        if self._locked_gate(target):
            self._emit("bump", at=list(target))
            raise GateLockedError(GUARD_GATE_LOCKED, at=target)
        self.pos = target
        self._emit("move")

    def turn_left(self) -> None:
        self.facing = self.facing.turned_left()
        self._emit("turn")

    def turn_right(self) -> None:
        self.facing = self.facing.turned_right()
        self._emit("turn")

    def hear(self, line: str) -> None:
        """React to one line the program printed.

        Locked gates right next to the piece (north, east, south or west, whichever
        way it faces) are listening. The exact passphrase opens a gate; anything
        else gets a reply from the guard, and the program carries on.
        """
        for gate in self.board.neighbours(self.pos):
            if not self._locked_gate(gate):
                continue
            if line == self.board.gates[gate]:
                self.opened.add(gate)
                self._emit("gate_open", at=list(gate))
            else:
                self._emit("guard", at=list(gate), message=GUARD_WRONG_PHRASE)

    def _locked_gate(self, pos: Pos) -> bool:
        return self.board.tile(pos) is Tile.GATE and pos not in self.opened

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
