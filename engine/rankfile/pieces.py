"""The pieces the player controls.

The player's code talks to a piece object: `pawn.move()`, `pawn.turn_left()`.
Each level unlocks some of the piece's *abilities* (its methods and
properties). A locked ability behaves as if it doesn't exist yet, except the
error says why.
"""

from typing import TYPE_CHECKING

from .board import square_name
from .exceptions import CantChangePieceError, GameArgumentError, LockedAbilityError, NoBoardError

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
        name = type(self).NAME
        try:
            return f"{name} at {square_name(world.pos)} facing {world.facing.value}"
        except NoBoardError:  # Scratch Python's stand-in piece (repl.py)
            return f"{name} (Scratch Python has no board: help({name}) shows what it knows)"


class Pawn(Piece):
    NAME = "pawn"
    ABILITIES = ("move", "turn_left", "turn_right", "at_goal", "position", "facing", "wait", "capture_left", "capture_right", "bridge")

    # These docstrings are the Codex's entries for the pawn (codex.py): the
    # Codex tab, the editor's hover tooltips and help() all show them.

    def move(self, squares=1):
        """Walk forward, one square at a time.

        `pawn.move()` takes one step, and `pawn.move(3)` takes three. A wall or
        the edge of the board in the way stops your program with an error.

        Args:
            squares: how many squares to walk, a whole number (int), 1 or more.
                Leave it out to walk 1.

        Returns:
            Nothing.

        Example:
            pawn.move(3)
        """
        for _ in range(_check_squares(squares)):
            self._world.move_forward()

    def turn_left(self):
        """Turn a quarter turn to the left, staying on the same square.

        Returns:
            Nothing.

        Example:
            pawn.turn_left()
        """
        self._world.turn_left()

    def turn_right(self):
        """Turn a quarter turn to the right, staying on the same square.

        Returns:
            Nothing.

        Example:
            pawn.turn_right()
        """
        self._world.turn_right()

    def wait(self):
        """Stand still for one tick, while everything else on the board takes its turn.

        It takes no number: to wait longer, call it again.

        Returns:
            Nothing.

        Example:
            pawn.wait()
        """
        self._world.wait()

    def capture_left(self):
        """Take the enemy one square diagonally forward and to the left, and move onto its square.

        That's how a chess pawn captures. With nothing there to take, it's an
        error.

        Returns:
            Nothing.

        Example:
            pawn.capture_left()
        """
        self._world.capture("left")

    def capture_right(self):
        """Take the enemy one square diagonally forward and to the right, and move onto its square.

        That's how a chess pawn captures. With nothing there to take, it's an
        error.

        Returns:
            Nothing.

        Example:
            pawn.capture_right()
        """
        self._world.capture("right")

    def bridge(self):
        """Lay a plank over the pit straight ahead, so you can walk across it.

        Your pawn needs to be carrying a plank: walking over one picks it up.

        Returns:
            Nothing.

        Example:
            pawn.bridge()
        """
        self._world.bridge()

    def at_goal(self) -> bool:
        """Check whether your pawn is standing on the goal square.

        Returns:
            True if it is, False if it isn't (a bool).

        Example:
            print(pawn.at_goal())
        """
        return self._world.at_goal()

    @property
    def position(self) -> tuple[int, int]:
        """Where your pawn is, as (x, y).

        No parentheses: it's something your pawn has, not something it does.
        The bottom-left square, a1, is (0, 0). x counts squares to the right,
        and y counts squares up.

        Returns:
            Two whole numbers in brackets (a tuple), like (2, 0).

        Example:
            print(pawn.position)
        """
        return self._world.pos

    @property
    def facing(self) -> str:
        """Which way your pawn is facing.

        No parentheses: it's something your pawn has, not something it does.

        Returns:
            "north", "east", "south" or "west" (text, a str).

        Example:
            print(pawn.facing)
        """
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
