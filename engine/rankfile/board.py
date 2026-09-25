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

    def turned_left(self) -> "Direction":
        return _CLOCKWISE[(_CLOCKWISE.index(self) - 1) % 4]

    def turned_right(self) -> "Direction":
        return _CLOCKWISE[(_CLOCKWISE.index(self) + 1) % 4]


_CLOCKWISE = [Direction.NORTH, Direction.EAST, Direction.SOUTH, Direction.WEST]
_DELTAS = {
    Direction.NORTH: (0, 1),
    Direction.EAST: (1, 0),
    Direction.SOUTH: (0, -1),
    Direction.WEST: (-1, 0),
}


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

    @property
    def blocks(self) -> bool:
        return self in (Tile.WALL, Tile.SIGN)


@dataclass
class Board:
    width: int
    height: int
    tiles: dict[Pos, Tile] = field(default_factory=dict)  # squares not listed are floor
    signs: dict[Pos, str] = field(default_factory=dict)  # text written on sign tiles

    def contains(self, pos: Pos) -> bool:
        x, y = pos
        return 0 <= x < self.width and 0 <= y < self.height

    def tile(self, pos: Pos) -> Tile:
        return self.tiles.get(pos, Tile.FLOOR)

    def blocked(self, pos: Pos) -> bool:
        return not self.contains(pos) or self.tile(pos).blocks
