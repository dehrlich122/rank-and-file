"""The board: squares, directions and tiles.

Coordinates are (x, y) pairs. (0, 0) is the bottom-left square, which chess
calls "a1". x grows to the east (files a, b, c, ...), y grows to the north
(ranks 1, 2, 3, ...).
"""

from dataclasses import dataclass, field
from enum import Enum

Pos = tuple[int, int]


class Direction(Enum):
    NORTH = "north"
    EAST = "east"
    SOUTH = "south"
    WEST = "west"

    @property
    def delta(self) -> Pos:
        """How (x, y) changes when taking one step this way."""
        return _DELTAS[self]

    def turned_left(self) -> Direction:
        return _CLOCKWISE[(_CLOCKWISE.index(self) - 1) % 4]

    def turned_right(self) -> Direction:
        return _CLOCKWISE[(_CLOCKWISE.index(self) + 1) % 4]


_CLOCKWISE = [Direction.NORTH, Direction.EAST, Direction.SOUTH, Direction.WEST]
_DELTAS = {
    Direction.NORTH: (0, 1),
    Direction.EAST: (1, 0),
    Direction.SOUTH: (0, -1),
    Direction.WEST: (-1, 0),
}


def sign(n: int) -> int:
    """-1, 0 or 1: which way along an axis `n` points."""
    return (n > 0) - (n < 0)


def step(pos: Pos, direction: Direction) -> Pos:
    dx, dy = direction.delta
    return (pos[0] + dx, pos[1] + dy)


def square_name(pos: Pos) -> str:
    """Chess-style name of a square: (0, 0) -> "a1", (2, 3) -> "c4"."""
    x, y = pos
    return f"{chr(ord('a') + x)}{y + 1}"


class Tile(Enum):
    FLOOR = "floor"
    WALL = "wall"
    SIGN = "sign"  # a signpost: blocks movement and holds some text
    GATE = "gate"  # locked until its passphrase is said next to it (see World.hear)
    PIT = "pit"  # stepping in loses the run (M3.1)
    WAYPOINT = "waypoint"  # must be crossed before the goal (M3.1)
    GEM = "gem"  # collected by walking over it (M3.1)
    PLANK = "plank"  # picked up by walking over it; pawn.bridge() lays it over a pit (QA-017)
    TIMED_GATE = "timed_gate"  # open only on every Nth tick of its clock (M3.1)

    @property
    def blocks(self) -> bool:
        """Always in the way. (Gates block only while locked, which the World tracks.)"""
        return self in (Tile.WALL, Tile.SIGN)


@dataclass
class Timer:
    """When a timed gate is open: for the first `open` ticks of every `every`
    ticks of its clock, starting open (QA-024)."""

    every: int
    clock: str = "action"
    open: int = 2  # long enough to step in, then out, arriving as it opens

    def is_open(self, ticks: int) -> bool:
        return ticks % self.every < self.open


@dataclass
class Board:
    width: int
    height: int
    tiles: dict[Pos, Tile] = field(default_factory=dict)  # squares not listed are floor
    signs: dict[Pos, str] = field(default_factory=dict)  # text written on sign tiles
    gates: dict[Pos, str] = field(default_factory=dict)  # the passphrase for each gate
    questions: dict[Pos, str] = field(default_factory=dict)  # what the guard asks, at gates that ask (M3.1)
    timers: dict[Pos, Timer] = field(default_factory=dict)  # when each timed gate is open (M3.1)

    def contains(self, pos: Pos) -> bool:
        x, y = pos
        return 0 <= x < self.width and 0 <= y < self.height

    def tile(self, pos: Pos) -> Tile:
        return self.tiles.get(pos, Tile.FLOOR)

    def squares(self, tile: Tile) -> list[Pos]:
        """Every square with this tile, in order along the ranks from a1."""
        return sorted((pos for pos, kind in self.tiles.items() if kind is tile), key=lambda pos: (pos[1], pos[0]))

    def blocked(self, pos: Pos) -> bool:
        return not self.contains(pos) or self.tile(pos).blocks

    def neighbours(self, pos: Pos) -> list[Pos]:
        """The squares directly north, east, south and west of `pos` that are on the board."""
        return [near for near in (step(pos, direction) for direction in Direction) if self.contains(near)]
