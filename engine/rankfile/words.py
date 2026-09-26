"""Wording shared by the engine's player-facing messages."""


def count(n: int, noun: str) -> str:
    """How many of something: "1 line", "3 lines". For nouns that just add an s."""
    return f"{n} {noun}" if n == 1 else f"{n} {noun}s"


def and_list(items: list[str]) -> str:
    """A list in words: "c3", "c3 and e5", "c3, d4 and e5"."""
    return items[0] if len(items) == 1 else f"{', '.join(items[:-1])} and {items[-1]}"
