import pytest

from rankfile.levels import parse_level


def make_level(map_text: str, **overrides):
    """A minimal valid level; override any key."""
    data = {
        "id": "test",
        "chapter": 1,
        "title": "Test",
        "trains": "testing",
        "lesson": "test.md",
        "api": ["move", "turn_left", "turn_right"],
        "map": map_text,
    }
    data.update(overrides)
    return parse_level(data)


def basics(state: dict) -> dict:
    """The piece and the gates from a world state, without the obstacles' parts (M3.1)."""
    return {key: state[key] for key in ("pos", "facing", "opened")}


def events(result, kind: str | None = None) -> list[dict]:
    """A run's world events, in order (only those of one `kind`, if given)."""
    return [event for step in result.steps for event in step["events"] if kind is None or event["kind"] == kind]


@pytest.fixture
def corridor():
    """Pawn on b1 facing north, goal on b4, walls on both sides."""
    return make_level("# G #\n# . #\n# . #\n# P #\n")


@pytest.fixture
def waiting_corridor():
    """Pawn on b1 facing north, goal on b3, with wait() and at_goal() unlocked."""
    return make_level("# G #\n# . #\n# P #\n", api=["move", "wait", "at_goal"])
