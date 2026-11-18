"""The pieces the player controls.

The player's code talks to a piece object: `pawn.move()`, `pawn.turn_left()`.
Each level unlocks some of the piece's *abilities* (its methods and
properties). A locked ability behaves as if it doesn't exist yet, except the
error says why.
"""

from typing import TYPE_CHECKING, ClassVar

from .board import square_name
from .exceptions import (
    CantChangePieceError,
    GameArgumentError,
    JumpError,
    LockedAbilityError,
    NoBoardError,
    WrongPieceError,
)
from .world import KNIGHT_JUMPS

if TYPE_CHECKING:
    from .world import World


class Piece:
    NAME = "piece"
    ABILITIES: tuple[str, ...] = ()
    # Other pieces' abilities this piece is asked for by mistake, and the kind
    # answer it gives instead of "doesn't have an ability called" (M5.1).
    CANT: ClassVar[dict[str, str]] = {}
    # Whether this piece lands on squares rather than steps or walks over them (M5.1): the words of its
    # levels, and the landings its world's state carries, follow it.
    LANDS: ClassVar[bool] = False

    def __init__(self, world: World, unlocked: list[str]):
        # Pieces refuse normal attribute assignment (see __setattr__), so the
        # constructor stores its private fields the low-level way.
        object.__setattr__(self, "_world", world)
        object.__setattr__(self, "_unlocked", tuple(name for name in self.ABILITIES if name in unlocked))

    def __getattribute__(self, name: str):
        # Called for every `piece.something` lookup, before the normal rules.
        cls = type(self)
        if name in cls.ABILITIES and name not in object.__getattribute__(self, "_unlocked"):
            raise LockedAbilityError(cls.NAME, name, list(object.__getattribute__(self, "_unlocked")))
        if name in cls.CANT:
            raise WrongPieceError(cls.CANT[name], name)
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
            # A knight jumps any way, so it has no `facing` to show (M5.1).
            facing = f" facing {world.facing.value}" if "facing" in type(self).ABILITIES else ""
            return f"{name} at {square_name(world.pos)}{facing}"
        except NoBoardError:  # Scratch Python's stand-in piece (repl.py)
            return f"{name} (Scratch Python has no board: help({name}) shows what it knows)"


class Pawn(Piece):
    NAME = "pawn"
    ABILITIES = (
        "move", "turn_left", "turn_right", "squares_ahead", "at_goal", "position", "facing", "wait",
        "capture_left", "capture_right", "bridge", "look", "read",
    )  # fmt: skip

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

    def squares_ahead(self) -> int:
        """Count the squares your pawn could walk straight ahead.

        It counts until something could stop you: a wall, the edge of the
        board, a signpost, or a gate, unless it's a guard's gate you've already
        opened. Counting is free: it doesn't take a tick.

        Returns:
            How many squares, a whole number (int). 0 if something is right in
            front of you.

        Example:
            print(pawn.squares_ahead())
        """
        return self._world.squares_ahead()

    def look(self, side=None) -> str | None:
        """Look at the square in front of your pawn, or diagonally in front.

        `pawn.look()` looks straight ahead. `pawn.look("left")` and
        `pawn.look("right")` look at the two squares diagonally ahead, the ones
        a pawn captures on. Looking is free: it doesn't take a tick.

        Args:
            side: "left" or "right" to look diagonally ahead. Leave it out to
                look straight ahead.

        Returns:
            What's there, as a word (a str): "wall", "edge", "pit", "gate",
            "portcullis", "signpost", "rune", "gem", "plank", or an enemy
            such as "rook". None if the square is empty.

        Example:
            if pawn.look() == "pit":
                pawn.bridge()
        """
        if side not in (None, "left", "right"):
            raise GameArgumentError(f'look() takes "left" or "right", or nothing to look straight ahead, not {side!r}.')
        return self._world.look(side)

    def read(self) -> str | None:
        """Read the rune your pawn is standing on.

        A rune is a square with text written on it. Walk onto it, then read
        it. Reading is free: it doesn't take a tick.

        Returns:
            The rune's text (a str), or None if your pawn isn't standing on a
            rune.

        Example:
            text = pawn.read()
            print(text)
        """
        return self._world.read()

    def wait(self, ticks=1):
        """Stand still while everything else on the board takes its turn.

        `pawn.wait()` waits one tick, and `pawn.wait(3)` waits three.
        `pawn.wait(0)` doesn't wait at all.

        Args:
            ticks: how many ticks to wait, a whole number (int) from 0 to
                100. Leave it out to wait 1.

        Returns:
            Nothing.

        Example:
            pawn.wait(2)
        """
        for _ in range(_check_ticks(ticks, self.NAME)):
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


_WALK = "Knights don't walk: they jump."


class Knight(Piece):
    """A pure knight (M5.1): it jumps in an L and never walks or turns. Its world keeps a facing
    all the same (the direction of the last jump's short leg), for the board to draw."""

    NAME = "knight"
    LANDS = True
    ABILITIES = ("jump", "look", "at_goal", "position", "wait", "read")
    CANT: ClassVar[dict[str, str]] = {
        "move": f"{_WALK} `knight.jump(1, 2)` jumps one square right and two up.",
        "turn_left": f"{_WALK} A jump can go any way from where the knight stands, so it never needs to turn.",
        "turn_right": f"{_WALK} A jump can go any way from where the knight stands, so it never needs to turn.",
        "facing": f"{_WALK} A jump can go any way, so a knight doesn't face anywhere in particular.",
        "squares_ahead": f"{_WALK} `knight.look(dx, dy)` says what's on a square it could land on.",
        "capture_left": f"{_WALK} A knight takes an enemy by landing on it: jump onto the enemy's square.",
        "capture_right": f"{_WALK} A knight takes an enemy by landing on it: jump onto the enemy's square.",
        "bridge": f"{_WALK} A jump flies over a pit, so a knight never needs a bridge.",
    }

    # These docstrings are the Codex's entries for the knight (codex.py), as the pawn's are for the pawn.

    def jump(self, dx, dy):
        """Jump in an L: two squares one way and one square the other.

        `knight.jump(1, 2)` jumps one square right and two up, and
        `knight.jump(-2, 1)` jumps two squares left and one up. A jump flies
        over anything in between: only the square it lands on matters.
        Landing on an enemy takes it. Landing on a wall, or off the board,
        stops your program with an error.

        Args:
            dx: how many squares right, a whole number (int). Below 0 goes
                left.
            dy: how many squares up, a whole number (int). Below 0 goes down.
                One of dx and dy is 1 or -1, and the other is 2 or -2.

        Returns:
            Nothing.

        Example:
            knight.jump(1, 2)
        """
        offset = _check_jump(dx, dy, "jump")  # before the world is asked, so Scratch Python's stand-in checks it too
        self._world.jump(*offset)

    def look(self, dx, dy) -> str | None:
        """Look at the square a jump would land on, without jumping.

        `knight.look(1, 2)` looks at the square one right and two up: the one
        `knight.jump(1, 2)` would land on. Looking is free: it doesn't take a
        tick.

        Args:
            dx: how many squares right, as for jump().
            dy: how many squares up, as for jump().

        Returns:
            What's there, as a word (a str): "wall", "edge", "pit", "gate",
            "portcullis", "signpost", "rune", "gem", "plank", or an enemy
            such as "rook". None if the square is empty.

        Example:
            print(knight.look(1, 2))
        """
        offset = _check_jump(dx, dy, "look")
        return self._world.look_at(*offset)

    def at_goal(self) -> bool:
        """Check whether your knight is standing on the goal square.

        It works just like the pawn's `at_goal()`.

        Returns:
            True if it is, False if it isn't (a bool).

        Example:
            print(knight.at_goal())
        """
        return self._world.at_goal()

    @property
    def position(self) -> tuple[int, int]:
        """Where your knight is, as (x, y).

        It works just like the pawn's `position`: no parentheses, and the
        bottom-left square, a1, is (0, 0).

        Returns:
            Two whole numbers in brackets (a tuple), like (2, 0).

        Example:
            print(knight.position)
        """
        return self._world.pos

    def wait(self, ticks=1):
        """Stand still while everything else on the board takes its turn.

        It works just like the pawn's `wait()`: `knight.wait()` waits one
        tick, and `knight.wait(3)` waits three.

        Args:
            ticks: how many ticks to wait, a whole number (int) from 0 to
                100. Leave it out to wait 1.

        Returns:
            Nothing.

        Example:
            knight.wait(2)
        """
        for _ in range(_check_ticks(ticks, self.NAME)):
            self._world.wait()

    def read(self) -> str | None:
        """Read the rune your knight is standing on.

        It works just like the pawn's `read()`: land on a rune, then read it.
        Reading is free: it doesn't take a tick.

        Returns:
            The rune's text (a str), or None if your knight isn't standing on
            a rune.

        Example:
            print(knight.read())
        """
        return self._world.read()


PIECES: dict[str, type[Piece]] = {"pawn": Pawn, "knight": Knight}


def _check_squares(squares) -> int:
    if _whole_number(squares, "move", "squares", "pawn.move(3)") < 1:
        raise GameArgumentError(f"move() needs at least 1 square, not {squares}. Pawns never step backwards!")
    return squares


MOST_TICKS = 100  # one wait's ceiling: each tick is recorded, so wait(10**6) would swamp the run


def _check_ticks(ticks, piece: str) -> int:
    """wait()'s number: 0 is fine, since a computed wait can come out as 0 (M3.2)."""
    if _whole_number(ticks, "wait", "ticks", f"{piece}.wait(3)") < 0:
        raise GameArgumentError(f"wait() can't wait {ticks} ticks. The fewest is 0, which doesn't wait at all.")
    if ticks > MOST_TICKS:
        raise GameArgumentError(f"wait() can't wait {ticks} ticks. The most is {MOST_TICKS}: nothing on a board takes that long to come round.")
    return ticks


def _check_jump(dx, dy, ability: str) -> tuple[int, int]:
    """A knight's jump() or look() offset, checked before the world is touched (M5.1): two whole numbers making an L."""
    for value in (dx, dy):
        _whole_number(value, ability, "squares", f"knight.{ability}(1, 2)", JumpError)
    if (dx, dy) not in KNIGHT_JUMPS:
        what = "isn't a jump a knight can make" if ability == "jump" else "isn't a square a knight's jump lands on"
        raise JumpError(
            f"{ability}({dx}, {dy}) {what}. A knight moves two squares one way and one the other: "
            f"knight.{ability}(1, 2) is one square right and two up, and knight.{ability}(-2, 1) is two left and one up."
        )
    return dx, dy


def _whole_number(value, ability: str, noun: str, like: str, error: type[GameArgumentError] = GameArgumentError) -> int:
    """An ability's number, checked: a whole number (not text, a float or True). `like`: a call to show, e.g. "pawn.move(3)"."""
    if isinstance(value, str):
        raise error(
            f"{ability}() needs a number of {noun}, like {like}. You gave it the text {value!r}. "
            "Numbers don't have quote marks around them."
        )
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise error(f"{ability}() needs a number of {noun}, like {like}, not {value!r}.")
    if isinstance(value, float):
        raise error(f"{ability}() needs a whole number of {noun}, like {like}, not {value!r}.")
    return value
