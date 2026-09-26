"""The game world: where the piece is, and everything that happens to it.

Every change is announced as an *event*: a small dict such as
{"kind": "move", "state": {"pos": [2, 3], "facing": "north", ...}}.
Events carry the whole world's state *after* they happened (the piece, which
gates are open, how many ticks have passed, ...), so the UI can show any
moment of a run by drawing that state. That's what makes step-back and rewind
cheap.

**Ticks** (M3.1). Obstacles keep time with a clock. The `action` clock ticks
once for every square the piece moves, every turn and every wait: the piece
acts, then everything on that clock takes its turn, like chess.

**Losing** (M3.1). Falling into a pit ends the run: the World raises `Lost`,
and remembers it in `lost`, so the run stays lost even if the player's code
catches the exception.
"""

from collections.abc import Callable
from typing import TYPE_CHECKING

from .board import Pos, Tile, square_name, step
from .exceptions import BlockedError, GateLockedError, Lost

if TYPE_CHECKING:
    from .levels import Level

Event = dict

# What the guard at a locked gate says. Every level with a gate shares these.
GUARD_WRONG_PHRASE = "The guard called your mother a hamster! The gate remains locked."
GUARD_GATE_LOCKED = "Does your father really smell of elderberries? Maybe try the passphrase first."

CLOCKS = ("action", "line", "new_line")


class World:
    def __init__(self, level: Level):
        self.level = level
        self.board = level.board
        self.pos = level.start
        self.facing = level.facing
        self.opened: set[Pos] = set()  # gates that have heard their passphrase
        self.refused: dict[Pos, int | None] = {}  # gate -> the line that last said the wrong thing to it
        self.ticks = dict.fromkeys(CLOCKS, 0)
        self.lost: Lost | None = None
        self.listeners: list[Callable[[Event], None]] = []

    def state(self) -> dict:
        return {
            "pos": list(self.pos),
            "facing": self.facing.value,
            "opened": [list(pos) for pos in sorted(self.opened)],
            "tick": self.ticks["action"],
            "lost": list(self.lost.at) if self.lost else None,  # where the run was lost
        }

    def move_forward(self) -> None:
        self._still_playing()
        target = step(self.pos, self.facing)
        if self.board.blocked(target):
            self._emit("bump", at=list(target))
            raise BlockedError(self._bump_message(target), at=target)
        if self._locked_gate(target):
            self._emit("bump", at=list(target))
            raise GateLockedError(self._gate_locked_message(target), at=target)
        self.pos = target
        self._emit("move")
        if self.board.tile(target) is Tile.PIT:
            self._lose(f"Your {self.level.piece} fell into the pit on {square_name(target)}.", target)
        self.tick("action")

    def at_goal(self) -> bool:
        return self.level.goal is not None and self.pos == self.level.goal

    def turn_left(self) -> None:
        self._still_playing()
        self.facing = self.facing.turned_left()
        self._emit("turn")
        self.tick("action")

    def turn_right(self) -> None:
        self._still_playing()
        self.facing = self.facing.turned_right()
        self._emit("turn")
        self.tick("action")

    def wait(self) -> None:
        """Stand still for one tick of the `action` clock."""
        self._still_playing()
        self._emit("wait")
        self.tick("action")

    def tick(self, clock: str) -> None:
        """One tick of `clock`: everything that keeps time with it takes its turn."""
        self.ticks[clock] += 1

    def hear(self, line: str, printed_on: int | None = None) -> None:
        """React to one line the program printed (on line `printed_on` of the player's code).

        Locked gates right next to the piece (north, east, south or west, whichever
        way it faces) are listening. The exact passphrase opens a gate; anything
        else gets a reply from the guard, and the program carries on.
        """
        if self.lost is not None:
            return
        for gate in self.board.neighbours(self.pos):
            if not self._locked_gate(gate):
                continue
            if line == self.board.gates[gate]:
                self.opened.add(gate)
                self._emit("gate_open", at=list(gate))
            else:
                self.refused[gate] = printed_on
                self._emit("guard", at=list(gate), message=GUARD_WRONG_PHRASE)

    def _still_playing(self) -> None:
        """A lost run stays lost: the piece can't act again, even if the player's code caught `Lost`."""
        if self.lost is not None:
            raise Lost(str(self.lost), self.lost.at)

    def _lose(self, message: str, at: Pos) -> None:
        self.lost = Lost(message, at)
        self._emit("lost", at=list(at), message=message)
        raise self.lost

    def _gate_locked_message(self, gate: Pos) -> str:
        """The guard's line, plus a pointer back to a wrong phrase if one was said here.

        The crash happens at the move, but the mistake was the earlier print, so
        the error points back to it: working from a crash back to its cause is
        a core debugging skill (QA-008).
        """
        if gate not in self.refused:
            return GUARD_GATE_LOCKED
        line = self.refused[gate]
        said = f"what line {line} printed" if line is not None else "what you said earlier"
        return f"{GUARD_GATE_LOCKED}\nThe guard didn't accept {said}."

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
