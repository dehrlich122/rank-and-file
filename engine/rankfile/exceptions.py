"""Errors raised by the game itself (as opposed to ordinary Python errors).

Each one carries a plain-language message, written for the player, as its
text. They still inherit from Python's own exception types (TypeError,
AttributeError, ...) so they behave the way Python programmers expect, for
example with `try`/`except` in later chapters.
"""


class GameError(Exception):
    """Base class for errors whose message is already written for the player."""


class BlockedError(GameError):
    """The piece tried to walk into a wall, a signpost, or off the board."""

    def __init__(self, message: str, at: tuple[int, int]):
        super().__init__(message)
        self.at = at


class LockedAbilityError(GameError, AttributeError):
    """The level hasn't unlocked this ability yet."""

    def __init__(self, piece: str, ability: str, unlocked: list[str]):
        knows = ", ".join(unlocked) if unlocked else "nothing yet"
        super().__init__(f"Your {piece} hasn't learned `{ability}` yet. In this level it knows: {knows}.")
        self.name = ability


class GameArgumentError(GameError, TypeError):
    """An ability was given a value it can't use, e.g. move("3")."""


class CantChangePieceError(GameError, AttributeError):
    """Player code tried to set an attribute on a piece, e.g. pawn.position = (0, 7)."""


# Tracebacks name an exception by its module, e.g. `rankfile.exceptions.BlockedError`.
# Claiming the builtins module makes them read like Python's own errors
# (`BlockedError: ...`), without the engine's internals in the way.
for _error in (GameError, BlockedError, LockedAbilityError, GameArgumentError, CantChangePieceError):
    _error.__module__ = "builtins"
