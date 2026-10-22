"""Free play's level keys (M4.4, docs/M4/M4.4.md): a challenge's set, any level's difficulty and "Draws on"
chapters, what describe() says about them, and the shape of the levelTags answer."""

import json

import pytest

from rankfile import bridge
from rankfile.levels import LevelError, parse_level

MAP = """
. . G
. . .
P . .
"""


def challenge(**changes):
    """A challenge as a set's file has it: a set and a difficulty, no chapter or lesson."""
    data = {"id": "last-rank-01", "title": "A challenge", "map": MAP, "api": ["move"], "set": "last-rank", "difficulty": 3, "draws_on": [2, 3]}
    data.update(changes)
    return {key: value for key, value in data.items() if value is not None}


def problem(**changes) -> LevelError:
    with pytest.raises(LevelError) as caught:
        parse_level(challenge(**changes))
    return caught.value


def test_a_challenge_is_read_with_its_set_difficulty_and_chapters():
    level = parse_level(challenge())
    assert (level.challenge_set, level.difficulty, level.draws_on, level.chapter, level.lesson) == ("last-rank", 3, [2, 3], 0, "")


def test_describe_gives_the_set_the_difficulty_and_the_chapters():
    info = parse_level(challenge()).describe()
    assert (info["set"], info["difficulty"], info["draws_on"]) == ("last-rank", 3, [2, 3])


def test_any_level_may_have_a_difficulty_and_none_is_null():
    plain = {"id": "mine", "title": "Mine", "map": MAP, "api": ["move"]}
    assert parse_level(plain).describe()["difficulty"] is None
    assert parse_level(plain).describe()["set"] == ""
    assert parse_level({**plain, "difficulty": 1}).difficulty == 1


@pytest.mark.parametrize("value", [0, 6, 2.5, "3", True])
def test_a_difficulty_is_a_whole_number_from_1_to_5(value):
    assert problem(difficulty=value).at == {"field": "difficulty"}


def test_a_challenge_needs_a_difficulty():
    assert "difficulty" in str(problem(difficulty=None))


@pytest.mark.parametrize("key, value", [("chapter", 4), ("lesson", "ch04/l1.md")])
def test_a_challenge_has_no_chapter_or_lesson(key, value):
    error = problem(**{key: value})
    assert error.at == {"field": "set"} and "no chapter or lesson" in str(error)


@pytest.mark.parametrize("value", ["Last Rank", "last_rank", "-last", "", 7])
def test_a_set_id_is_lower_case_words_joined_by_dashes(value):
    assert problem(set=value).at == {"field": "set"}


@pytest.mark.parametrize("value", [3, [0], ["4"], [True]])
def test_draws_on_is_a_list_of_chapter_numbers(value):
    assert problem(draws_on=value).at == {"field": "draws_on"}


def test_level_tags_answers_a_tier_and_a_chapter():
    chapters = [{"curriculum": True, "chapter": 1, "tier": "pawn", "levels": [{"id": "x", "data": challenge(), "lesson": ""}]}]
    answer = json.loads(bridge.level_tags(json.dumps(challenge()), json.dumps(chapters)))
    assert set(answer) == {"tier", "chapter"}
    assert answer["tier"] == "pawn"
