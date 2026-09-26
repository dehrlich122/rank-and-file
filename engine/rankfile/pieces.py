"""The pieces the player controls.

The player's code talks to a piece object: `pawn.move()`, `pawn.turn_left()`.
Each level unlocks some of the piece's *abilities* (its methods and
properties). A locked ability behaves as if it doesn't exist yet, except the
error says why.
"""

from typing import TYPE_CHECKING

from .board import square_name
from .exceptions import CantChangePieceError, GameArgumentError, LockedAbilityError

if TYPE_CHECKING:
    from .world import World


class Piece:
    NAME = "piece"
    ABILITIES: tuple[str, ...] = ()

    def __init__(self, world: World, unlocked: list[str]):
        # Pieces refuse normal attribute assignment (see __setattr__), so the
        # constructor stores its two private fields the low-level way.
        object.__setattr__(self, "_world", world)
        object.__setattr__(self, "_unlocked", tuple(name for name in self.ABILITIES if name in unlocked))

    def __getattribute__(self, name: str):
        # Called for every `piece.something` lookup, before the normal rules.
        cls = type(self)
        if name in cls.ABILITIES and name not in object.__getattribute__(self, "_unlocked"):
            raise LockedAbilityError(cls.NAME, name, list(object.__getattribute__(self, "_unlocked")))
        return object.__getattribute__(self, name)

    def __setattr__(self, name: str, value) -> None:
        piece = type(self).NAME
        if name in type(self).ABILITIES:
            raise CantChangePieceError(
                f"You can't change the {piece}'s `{name}` directly. The {piece} has to use its own abilities."
            )
        raise CantChangePieceError(f"You can't add new things to the {piece}. Try a variable of your own instead.")

    def __dir__(self) -> list[str]:
        return list(self._unlocked)

    def __repr__(self) -> str:
        world = self._world
        return f"{type(self).NAME} at {square_name(world.pos)} facing {world.facing.value}"


class Pawn(Piece):
    NAME = "pawn"
    ABILITIES = ("move", "turn_left", "turn_right", "position", "facing")

    def move(self, squares=1):
        """Walk forward. `pawn.move()` takes one step; `pawn.move(3)` takes three."""
        for _ in range(_check_squares(squares)):
            self._world.move_forward()

    def turn_left(self):
        """Turn a quarter turn to the left, staying on the same square."""
        self._world.turn_left()

    def turn_right(self):
        """Turn a quarter turn to the right, staying on the same square."""
        self._world.turn_right()

    @property
    def position(self) -> tuple[int, int]:
        """Where the pawn is, as (x, y). The bottom-left square a1 is (0, 0)."""
        return self._world.pos

    @property
    def facing(self) -> str:
        """Which way the pawn is facing: "north", "east", "south" or "west"."""
        return self._world.facing.value


PIECES: dict[str, type[Piece]] = {"pawn": Pawn}


def _check_squares(squares) -> int:
    if isinstance(squares, str):
        raise GameArgumentError(
            f"move() needs a number of squares, like pawn.move(3). You gave it the text {squares!r}. "
            "Numbers don't have quote marks around them."
        )
    if isinstance(squares, bool) or not isinstance(squares, (int, float)):
        raise GameArgumentError(f"move() needs a number of squares, like pawn.move(3), not {squares!r}.")
    if isinstance(squares, float):
        raise GameArgumentError(f"move() needs a whole number of squares, like pawn.move(3), not {squares!r}.")
    if squares < 1:
        raise GameArgumentError(f"move() needs at least 1 square, not {squares}. Pawns never step backwards!")
    return squares
