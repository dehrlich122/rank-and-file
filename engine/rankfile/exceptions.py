"""Errors raised by the game itself (as opposed to ordinary Python errors).

Each one carries a plain-language message, written for the player, as its
text. They still inherit from Python's own exception types (TypeError,
AttributeError, ...) so they behave the way Python programmers expect, for
example with `try`/`except` in later chapters.
"""


class GameError(Exception):
    """Base class for errors whose message is already written for the player."""

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        cls.__module__ = "builtins"  # see the note at the end of this file


class BlockedError(GameError):
    """The piece tried to walk into a wall, a signpost, or off the board."""

    def __init__(self, message: str, at: tuple[int, int]):
        super().__init__(message)
        self.at = at


class GateLockedError(BlockedError):
    """The piece tried to walk through a gate that hasn't been opened yet."""


class DoorLockedError(BlockedError):
    """The piece tried to land on a door whose key it isn't carrying (M5.3)."""


class CaptureError(GameError):
    """The piece tried to capture where there's nothing it can take (M3.1)."""


class BridgeError(GameError):
    """The piece tried to lay a plank with none to lay, or where there's no pit (QA-017)."""


class PickUpError(GameError):
    """The piece tried to pick something up where there's nothing to take (M5.3)."""


class LostTrackError(GameError):
    """A run came out of its recursion limit without the tracer: nothing it did afterwards was counted or recorded."""

    def __init__(self):
        super().__init__(
            "The game lost track of this program partway through, so the run ends here. "
            "That happens when a function calls itself until Python stops it and the program carries on anyway. "
            "Give the function a way to stop calling itself."
        )


IT_KNOWS = "In this level it knows"  # how every message that lists what the piece can do starts


class LockedAbilityError(GameError, AttributeError):
    """The level hasn't unlocked this ability yet."""

    def __init__(self, piece: str, ability: str, unlocked: list[str]):
        knows = ", ".join(unlocked) if unlocked else "nothing yet"
        super().__init__(f"Your {piece} hasn't learned `{ability}` yet. {IT_KNOWS}: {knows}.")
        self.name = ability


class GameArgumentError(GameError, TypeError):
    """An ability was given a value it can't use, e.g. move("3")."""


class JumpError(GameArgumentError):
    """A knight was asked to jump, or look, somewhere that isn't an L, e.g. jump(1, 1) (M5.1)."""


class WrongPieceError(GameError, AttributeError):
    """A piece was asked for another piece's ability, e.g. knight.move() (M5.1). Its text is the piece's `CANT` entry."""

    def __init__(self, message: str, ability: str):
        super().__init__(message)
        self.name = ability


class CantChangePieceError(GameError, AttributeError):
    """Player code tried to set an attribute on a piece, e.g. pawn.position = (0, 7)."""


class NoBoardError(GameError):
    """Scratch Python's stand-in piece was asked to act or say where it is (docs/Codex.md)."""


class Lost(BaseException):
    """The run is over and lost: the piece fell into a pit or was caught (M3.1).

    Like the line budget's StepBudgetExceeded, it derives from BaseException, so
    a player's `except Exception:` can't swallow it. The World also remembers
    the loss (`World.lost`), so even a bare `except:` can't undo it.
    """

    def __init__(self, message: str, at: tuple[int, int]):
        super().__init__(message)
        self.at = at


# Tracebacks name an exception by its module, e.g. `rankfile.exceptions.BlockedError`.
# Claiming the builtins module makes them read like Python's own errors
# (`BlockedError: ...`), without the engine's internals in the way. Every
# subclass of GameError claims it by itself (GameError.__init_subclass__).
for _error in (GameError, Lost):
    _error.__module__ = "builtins"
