"""Wording shared by the engine's player-facing messages."""


def count(n: int, noun: str) -> str:
    """How many of something: "1 line", "3 lines". For nouns that just add an s."""
    return f"{n} {noun}" if n == 1 else f"{n} {noun}s"
