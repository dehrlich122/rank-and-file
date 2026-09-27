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

The `line` and `new_line` clocks tick as the player's code runs: the tracer
calls `on_line` as each line starts.

**Enemies** (M3.1). Patrols walk their route and chasers step toward the
piece, one square per tick of their clock. The piece can capture one
diagonally forward, chess style.

**Losing** (M3.1). Falling into a pit, or being caught (sharing a square with
an enemy), ends the run: the World raises `Lost`, and remembers it in `lost`,
so the run stays lost even if the player's code catches the exception.
"""

import copy
import functools
from collections.abc import Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING

from .board import Pos, Tile, sign, square_name, step
from .exceptions import BlockedError, CaptureError, GateLockedError, Lost

if TYPE_CHECKING:
    from .levels import Enemy, Level

Event = dict

# What the guard at a locked gate says. Every level with a gate shares these.
GUARD_WRONG_PHRASE = "The guard called your mother a hamster! The gate remains locked."
GUARD_GATE_LOCKED = "Does your father really smell of elderberries? Maybe try the passphrase first."
# ...and at a gate whose guard asks a question (M3.1).
GUARD_WRONG_ANSWER = '"Wrong!" says the guard. The gate remains locked.'

CLOCKS = ("action", "line", "new_line")
CODE_CLOCKS = {"line", "new_line"}  # the clocks that keep time with the code, not the piece


@dataclass
class Foe:
    """An enemy on the board as a run goes on. Its rules are the level's `Enemy`."""

    enemy: Enemy
    pos: Pos
    index: int = 0  # a patrol: where it is along its path
    heading: int = 1  # a patrol that walks back and forth: 1 along its path, -1 back
    captured: bool = False



def _acts(method: Callable) -> Callable:
    """A piece's action (a move, turn, wait or capture). A lost piece can't act
    again, and every action is one tick of the `action` clock once it's done."""

    @functools.wraps(method)
    def act(world: World, *args) -> None:
        world._still_playing()
        method(world, *args)
        world.tick("action")

    return act


class World:
    def __init__(self, level: Level):
        self.level = level
        self.board = level.board
        self.pos = level.start
        self.facing = level.facing
        self.opened: set[Pos] = set()  # gates that have heard their passphrase
        self.refused: dict[Pos, int | None] = {}  # gate -> the line that last said the wrong thing to it
        self.crossed: set[Pos] = set()  # waypoints the piece has passed over
        self.collected: set[Pos] = set()  # gems the piece has picked up
        self.ticks = dict.fromkeys(CLOCKS, 0)
        self.lines_seen: set[int] = set()  # for the new_line clock
        self.foes = [Foe(enemy, enemy.start, enemy.path.index(enemy.start)) for enemy in level.enemies]
        # The clocks something keeps time with: their ticks show up in the recording.
        self.clocked = {timer.clock for timer in self.board.timers.values()} | {enemy.clock for enemy in level.enemies}
        self.lost: Lost | None = None
        self.listeners: list[Callable[[Event], None]] = []

    def copy(self) -> World:
        """An independent copy, with no listeners, for trying moves out (scripts/solve.py)."""
        twin = copy.copy(self)
        twin.opened, twin.refused = set(self.opened), dict(self.refused)
        twin.crossed, twin.collected = set(self.crossed), set(self.collected)
        twin.ticks, twin.lines_seen = dict(self.ticks), set(self.lines_seen)
        twin.foes = [copy.copy(foe) for foe in self.foes]
        twin.listeners = []
        return twin

    def state(self) -> dict:
        opened = self.opened | self._open_timed_gates() if self.board.timers else self.opened
        return {
            "pos": list(self.pos),
            "facing": self.facing.value,
            "opened": [list(pos) for pos in sorted(opened)],
            "crossed": [list(pos) for pos in sorted(self.crossed)],
            "collected": [list(pos) for pos in sorted(self.collected)],
            "enemies": [None if foe.captured else list(foe.pos) for foe in self.foes],  # None once captured
            "tick": self.ticks["action"],
            "lost": list(self.lost.at) if self.lost else None,  # where the run was lost
        }

    @_acts
    def move_forward(self) -> None:
        target = step(self.pos, self.facing)
        if self.board.blocked(target) or self._shut(target):
            self._emit("bump", at=list(target))
            raise BlockedError(self._bump_message(target), at=target)
        if self._locked_gate(target):
            self._emit("bump", at=list(target))
            raise GateLockedError(self._gate_locked_message(target), at=target)
        self._step_onto(target)
        self._emit("move")
        if self.board.tile(target) is Tile.PIT:
            self._lose(f"Your {self.level.piece} fell into the pit on {square_name(target)}.", target)
        self._check_caught()

    def at_goal(self) -> bool:
        return self.level.goal is not None and self.pos == self.level.goal

    @_acts
    def turn_left(self) -> None:
        self.facing = self.facing.turned_left()
        self._emit("turn")

    @_acts
    def turn_right(self) -> None:
        self.facing = self.facing.turned_right()
        self._emit("turn")

    @_acts
    def wait(self) -> None:
        """Stand still for one tick of the `action` clock."""
        self._emit("wait")

    @_acts
    def capture(self, side: str) -> None:
        """Take the enemy diagonally forward on `side` ("left" or "right"), chess style, and move onto its square."""
        across = self.facing.turned_left() if side == "left" else self.facing.turned_right()
        target = step(step(self.pos, self.facing), across)
        foe = self._foe_at(target)
        if foe is None or foe.enemy.armoured:
            self._emit("bump", at=list(target))
            raise CaptureError(self._capture_message(target, foe))
        foe.captured = True
        self._step_onto(target)
        self._emit("capture", at=list(target))
        self._check_caught()

    def tick(self, clock: str) -> None:
        """One tick of `clock`: everything that keeps time with it takes its turn."""
        self.ticks[clock] += 1
        moving = [foe for foe in self.foes if foe.enemy.clock == clock and not foe.captured]
        for foe in moving:
            self._advance(foe)
        if clock in self.clocked:
            self._emit("tick")
        if moving:
            self._check_caught()

    def on_line(self, line: int) -> None:
        """A line of the player's code is starting to run: the code's own clocks tick."""
        if self.lost is not None:
            return
        self.tick("line")
        if line not in self.lines_seen:
            self.lines_seen.add(line)
            self.tick("new_line")

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
                reply = GUARD_WRONG_ANSWER if gate in self.board.questions else GUARD_WRONG_PHRASE
                self._emit("guard", at=list(gate), message=reply)

    def _step_onto(self, pos: Pos) -> None:
        """Move the piece. Crossing a waypoint or a gem counts even when it walks straight on."""
        self.pos = pos
        tile = self.board.tile(pos)
        if tile is Tile.WAYPOINT:
            self.crossed.add(pos)
        elif tile is Tile.GEM:
            self.collected.add(pos)

    def _advance(self, foe: Foe) -> None:
        """An enemy's turn: a chaser steps toward the piece, a patrol along its route."""
        enemy = foe.enemy
        if enemy.kind == "chaser":
            foe.pos = CHASERS[enemy.strategy](self, foe.pos)
            return
        if len(enemy.path) == 1:
            return  # it stands guard
        if enemy.loop:
            foe.index = (foe.index + 1) % len(enemy.path)
        else:
            if not 0 <= foe.index + foe.heading < len(enemy.path):
                foe.heading = -foe.heading  # the end of its route: back the other way
            foe.index += foe.heading
        foe.pos = enemy.path[foe.index]

    def _chase_simply(self, pos: Pos) -> Pos:
        """The simple chaser's step: toward the piece along the bigger gap (east or
        west on a tie). If that's blocked it tries the other way; if both are, it waits."""
        dx, dy = self.pos[0] - pos[0], self.pos[1] - pos[1]
        across = (sign(dx), 0) if dx else None
        along = (0, sign(dy)) if dy else None
        for delta in (across, along) if abs(dx) >= abs(dy) else (along, across):
            if delta is not None:
                target = (pos[0] + delta[0], pos[1] + delta[1])
                if self._enemy_can_enter(target):
                    return target
        return pos

    def _enemy_can_enter(self, pos: Pos) -> bool:
        if self.board.blocked(pos) or self.board.tile(pos) is Tile.PIT or self._locked_gate(pos) or self._shut(pos):
            return False
        return self._foe_at(pos) is None

    def _foe_at(self, pos: Pos) -> Foe | None:
        """The enemy on `pos`, if one is there (captured ones are gone)."""
        return next((foe for foe in self.foes if not foe.captured and foe.pos == pos), None)

    def _check_caught(self) -> None:
        if foe := self._foe_at(self.pos):
            self._lose(f"Your {self.level.piece} was caught by the {foe.enemy.kind} on {square_name(self.pos)}.", self.pos)

    def _capture_message(self, target: Pos, foe: Foe | None) -> str:
        if not self.board.contains(target):
            return f"There's no square there to capture on: your {self.level.piece} is on {square_name(self.pos)}, at the edge of the board."
        if foe is None:
            return f"There's nothing to capture on {square_name(target)}."
        return f"The {foe.enemy.kind} on {square_name(target)} is armoured: it can't be captured."

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
        question = self.board.questions.get(gate)
        locked = f'The guard won\'t open the gate until you answer: "{question}"' if question else GUARD_GATE_LOCKED
        if gate not in self.refused:
            return locked
        line = self.refused[gate]
        said = f"what line {line} printed" if line is not None else "what you said earlier"
        return f"{locked}\nThe guard didn't accept {said}."

    def _open_timed_gates(self) -> set[Pos]:
        return {pos for pos in self.board.timers if not self._shut(pos)}

    def _shut(self, pos: Pos) -> bool:
        """A timed gate is shut except when its clock's ticks are a multiple of `every`."""
        timer = self.board.timers.get(pos)
        return timer is not None and self.ticks[timer.clock] % timer.every != 0

    def _locked_gate(self, pos: Pos) -> bool:
        return self.board.tile(pos) is Tile.GATE and pos not in self.opened

    def _emit(self, kind: str, **details) -> None:
        if not self.listeners:
            return  # nobody is recording (e.g. scripts/solve.py's search)
        event = {"kind": kind, "state": self.state(), **details}
        for listener in self.listeners:
            listener(event)

    def _bump_message(self, target) -> str:
        piece = self.level.piece
        here = square_name(self.pos)
        if not self.board.contains(target):
            return f"Your {piece} can't walk off the edge of the board. It's on {here}, facing {self.facing.value}."
        if target in self.board.timers:
            every = self.board.timers[target].every
            return f"Your {piece} bumped into the gate on {square_name(target)}. It's shut right now: it opens every {every} ticks."
        what = "a signpost" if self.board.tile(target) is Tile.SIGN else "a wall"
        return f"Your {piece} bumped into {what} on {square_name(target)}."


# How each kind of chaser picks its step (a level's `strategy`). Cleverer ones come later.
CHASERS: dict[str, Callable[[World, Pos], Pos]] = {"simple": World._chase_simply}
