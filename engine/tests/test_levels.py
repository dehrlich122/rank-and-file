"""The level checker: every level file, lesson and solution, checked automatically.

For each level (levels/<folder>/<id>.yaml: a chapter, chNN, or practice) it checks that:
- the level file is valid and its id matches its file name;
- the reference solution (solutions/chNN/<id>.py) solves it, and passes time
  with `wait()`, never by turning on the spot;
- every naive solution (solutions/chNN/<id>.naive*.py) fails the way its
  first line says it should (`# expect: <status>`, optionally followed by the
  error type, e.g. `# expect: error GateLockedError`);
- the idiomatic-solution note (solutions/chNN/<id>.md) exists;
- the lesson has at most 150 words of prose and 1-3 runnable snippets, each of
  which runs as expected (``` python run ``` must not fail; ``` python run error ```
  must fail, and ``` python run lost ``` must lose the run, on purpose). They run
  on the level's `lesson_board` if it has one;
- the Codex (docs/Codex.md) documents every built-in a lesson calls, and the
  reference only calls built-ins that a lesson up to its level teaches.
"""

import functools
import re
from pathlib import Path

import pytest
import yaml

from rankfile import codex
from rankfile.board import Direction
from rankfile.levels import parse_level
from rankfile.runner import run_level, run_sandbox

ROOT = Path(__file__).resolve().parents[2]
LEVEL_FILES = sorted((ROOT / "levels").glob("*/*.yaml"))
MAX_LESSON_WORDS = 150
FENCED = re.compile(r"^```.*?^```", re.MULTILINE | re.DOTALL)
FACING_ACTIONS = {"move", "capture", "bridge"}  # the actions that go the way the piece faces


def load(path: Path):
    return parse_level(yaml.safe_load(path.read_text(encoding="utf-8")))


def solutions_dir(path: Path) -> Path:
    return ROOT / "solutions" / path.parent.name


def without_expect_line(code: str) -> tuple[str, str | None, str]:
    """Split off `# expect: <status> [ErrorType]`; returns (status, error type or None, code)."""
    first, _, rest = code.partition("\n")
    match = re.fullmatch(r"# expect: (\w+)(?: (\w+))?", first.strip())
    assert match, "naive solutions must start with '# expect: <status> [ErrorType]'"
    return match.group(1), match.group(2), rest


@pytest.fixture(params=LEVEL_FILES, ids=[path.stem for path in LEVEL_FILES])
def level_file(request) -> Path:
    return request.param


def test_there_are_levels():
    assert len(LEVEL_FILES) >= 5


def test_level_ids_are_unique():
    ids = [load(path).id for path in LEVEL_FILES]
    assert len(ids) == len(set(ids))


def test_every_chapter_is_listed():
    chapters = {entry["chapter"] for entry in yaml.safe_load((ROOT / "levels" / "chapters.yaml").read_text("utf-8"))}
    assert {load(path).chapter for path in LEVEL_FILES if not load(path).challenge_set} <= chapters


def listed_sets() -> list[dict]:
    """levels/challenges.yaml: Free Play's challenge sets, in order (M4.4)."""
    return yaml.safe_load((ROOT / "levels" / "challenges.yaml").read_text("utf-8")) or []


def test_every_challenge_set_is_listed_with_its_own_folder():
    sets = {entry["set"]: entry for entry in listed_sets()}
    tiers = {entry["tier"] for entry in yaml.safe_load((ROOT / "levels" / "chapters.yaml").read_text("utf-8"))}
    assert all(entry["tier"] in tiers and entry["title"] and entry["summary"] for entry in sets.values())
    for path in LEVEL_FILES:
        level = load(path)
        if level.challenge_set:
            assert level.challenge_set in sets, f"{path.stem}: its set isn't in challenges.yaml"
            assert path.parent.name == level.challenge_set, f"{path.stem} belongs in the folder named after its set"
            assert re.fullmatch(rf"{level.challenge_set}-\d\d", level.id), f"{path.stem}: a challenge's id is <set>-NN"
            assert level.draws_on, f"{path.stem}: a challenge names the chapters it draws on"


def test_level_file_is_valid(level_file):
    level = load(level_file)
    assert level.id == level_file.stem
    assert level.hints, "every level needs hints"
    assert level.par.lines, "every level needs a line par, for its par star"


def run_reference(level, level_file: Path):
    """Run the level's reference solution. (Never printed: the checker must never spoil it.)"""
    return run_level(level, (solutions_dir(level_file) / f"{level.id}.py").read_text(encoding="utf-8"))


def test_reference_solution_solves_it(level_file):
    level = load(level_file)
    result = run_reference(level, level_file)
    assert result.status == "solved", f"{level.id}: {result.summary}"
    # ...and it earns every star, so each level's par is reachable.
    assert all(star.earned for star in result.stars), f"{level.id}: {[star.label for star in result.stars]}"


def test_reference_solution_waits_rather_than_spinning(level_file):
    """A turn spends a tick just like `wait()`, so a solution can pass time by
    turning away and back. On every level (designer, 2026-10-07; QA-026 began
    it where `wait()` is unlocked), the reference never turns more than it
    needs to between one step and the next, and doesn't turn after its last
    step, except to finish a loop's last lap: a turn by a line that already ran."""
    level = load(level_file)
    result = run_reference(level, level_file)
    # A level with several cases records each one separately, and the run itself has no steps.
    for steps in [case["steps"] for case in result.cases] or [result.steps]:
        stepped = facing = level.facing  # the facing at the last step, and now
        turns = 0  # since the last step
        added = False  # since the last step, a turn by a line running for the first time
        ran: set[int] = set()  # the lines that have run
        for step in steps:
            for event in step["events"]:
                if event["kind"] == "turn":
                    facing, turns = Direction(event["state"]["facing"]), turns + 1
                    added = added or step["line"] not in ran
                elif event["kind"] in FACING_ACTIONS:
                    assert turns == quarter_turns(stepped, facing), f"{level.id}: the reference turns more than it needs to"
                    stepped, turns, added = facing, 0, False
            ran.add(step["line"])
        assert not added, f"{level.id}: the reference turns after its last step"


def quarter_turns(start: Direction, end: Direction) -> int:
    """The fewest quarter turns from facing `start` to facing `end`."""
    return 0 if start is end else 2 if start.turned_left().turned_left() is end else 1


def test_naive_solutions_fail_as_intended(level_file):
    level = load(level_file)
    naive_files = sorted(solutions_dir(level_file).glob(f"{level.id}.naive*.py"))
    assert naive_files, f"{level.id} needs at least one naive solution that must fail"
    for path in naive_files:
        expected, error_type, code = without_expect_line(path.read_text(encoding="utf-8"))
        assert expected != "solved"
        result = run_level(level, code)
        assert result.status == expected, f"{path.name}: expected {expected}, got {result.status}: {result.summary}"
        if error_type:
            assert result.error and result.error.type == error_type, f"{path.name}: expected {error_type}: {result.summary}"


def test_idiomatic_note_exists(level_file):
    level = load(level_file)
    note = solutions_dir(level_file) / f"{level.id}.md"
    assert note.exists() and note.read_text(encoding="utf-8").strip()


RUN_FENCE = re.compile(r"^```python run", re.MULTILINE)


def run_fence_counts(text: str) -> tuple[int, int]:
    """(the fence lines the page would run, the snippets the engine reads) in a lesson. The page (lesson.ts) runs any
    fence line that starts with ```python run; the engine's `codex.SNIPPET` needs its exact grammar. A fence it doesn't
    read would run on the page and never be checked. Counted on lines: a fence inside a fence isn't looked for."""
    return len(RUN_FENCE.findall(text)), len(codex.snippets(text))


def test_a_mis_spaced_run_fence_is_not_read_the_same_by_both():
    good = "```python run\nx = 1\n```\n```python run error\nx\n```\n```python run lost calls f(1)\ndef f(n): pass\n```\n"
    assert run_fence_counts(good) == (3, 3)
    for fence in ("python run  calls f(1)", "python run\tcalls f(1)", "python run finished", "python run callsf(1)", "python run  error"):
        assert run_fence_counts(f"```{fence}\nx = 1\n```\n") == (1, 0), fence


def test_lesson_is_short_and_runnable(level_file):
    level = load(level_file)
    if level.challenge_set:
        return  # a challenge has no lesson (M4.4)
    text = (ROOT / "lessons" / level.lesson).read_text(encoding="utf-8")

    prose = FENCED.sub("", text)
    words = re.findall(r"[A-Za-z0-9_']+", prose)
    assert len(words) <= MAX_LESSON_WORDS, f"{level.lesson} has {len(words)} words of prose"

    fences, read = run_fence_counts(text)
    assert fences == read, f"{level.lesson}: {fences} fence lines start with ```python run, but the engine reads {read} snippets"
    snippets = codex.snippets(text)
    assert 1 <= len(snippets) <= 3, f"{level.lesson} needs 1-3 runnable snippets"
    for meant, call, code in snippets:
        result = run_sandbox(code, level.api, piece=level.piece, lesson_board=level.lesson_board, call=call)
        if meant:
            assert result.status == meant, f"snippet should end in {meant} on purpose, not {result.status}:\n{code}"
        else:
            assert result.status == "finished", f"snippet failed ({result.summary}):\n{code}"


# -- the Codex (docs/Codex.md) -------------------------------------------------------


@functools.cache
def chapters_in_play_order() -> list[dict]:
    """Every chapter's levels and lessons, as the UI sends them for a level's Codex:
    chapters.yaml's order, then each chapter's levels by id (content.ts). A tier's challenge sets come straight after
    its last curriculum chapter (M4.4), as content.codexChapters() puts them."""
    data = {path: yaml.safe_load(path.read_text(encoding="utf-8")) for path in LEVEL_FILES}
    listed = yaml.safe_load((ROOT / "levels" / "chapters.yaml").read_text("utf-8"))

    def item(path: Path) -> dict:
        lesson = data[path].get("lesson")
        return {"id": path.stem, "data": data[path], "lesson": (ROOT / "lessons" / lesson).read_text(encoding="utf-8") if lesson else ""}

    order = []
    for i, entry in enumerate(listed):
        curriculum = entry.get("curriculum", True)
        levels = [item(path) for path in LEVEL_FILES if "set" not in data[path] and data[path]["chapter"] == entry["chapter"]]
        order.append({"curriculum": curriculum, "chapter": entry["chapter"], "tier": entry["tier"], "levels": levels})
        later = [other for other in listed[i + 1 :] if other.get("curriculum", True) and other["tier"] == entry["tier"]]
        if curriculum and not later:
            for challenge_set in (s for s in listed_sets() if s["tier"] == entry["tier"]):
                levels = [item(path) for path in LEVEL_FILES if data[path].get("set") == challenge_set["set"]]
                order.append({"curriculum": False, "chapter": 0, "tier": challenge_set["tier"], "levels": levels})
    return order


def test_a_level_is_tiered_by_the_latest_chapter_that_teaches_what_it_needs():
    """On the real curriculum: a made-up level with a move and a required `while` is as late as the chapter that teaches while."""
    made_up = {"id": "q", "title": "q", "map": "P . G", "api": ["move"], "constraints": {"require_nodes": ["While"]}}
    answer = codex.level_tags(made_up, chapters_in_play_order())
    assert answer["chapter"] == 5 and answer["tier"] == "pawn"
    assert codex.level_tags({**made_up, "constraints": {}}, chapters_in_play_order())["chapter"] == 1


def test_every_curriculum_level_is_tiered_by_its_own_chapter():
    """The rule against the real curriculum: nothing a level needs comes from a later chapter than its own."""
    for chapter in chapters_in_play_order():
        if not chapter["curriculum"]:
            continue
        for item in chapter["levels"]:
            answer = codex.level_tags(item["data"], chapters_in_play_order())
            assert answer["tier"] == chapter["tier"], f"{item['id']}: tiered {answer['tier']} (chapter {answer['chapter']}), not by its own chapter {chapter['chapter']}"
            assert answer["chapter"] <= chapter["chapter"], f"{item['id']}: needs something chapter {answer['chapter']} teaches, after its own"


def test_every_challenge_is_tiered_as_its_set_says():
    """A challenge's tier is worked out from what it needs, and must be its set's (levels/challenges.yaml)."""
    tiers = {entry["set"]: entry["tier"] for entry in listed_sets()}
    for path in LEVEL_FILES:
        level = load(path)
        if level.challenge_set:
            data = yaml.safe_load(path.read_text(encoding="utf-8"))
            assert codex.level_tags(data, chapters_in_play_order())["tier"] == tiers[level.challenge_set], f"{level.id}: needs more than the {tiers[level.challenge_set]} tier teaches"


def test_lesson_builtins_have_codex_entries(level_file):
    """Every built-in a lesson calls is documented, so the Codex can list it."""
    if load(level_file).challenge_set:
        return  # a challenge has no lesson (M4.4)
    lesson = (ROOT / "lessons" / load(level_file).lesson).read_text(encoding="utf-8")
    called = set().union(*map(codex.python_called, codex.lesson_snippets(lesson)))
    missing = called - set(codex.PYTHON)
    assert not missing, f"{load(level_file).lesson} calls {sorted(missing)}: document them in codex.BUILTINS or codex.METHODS"


def test_reference_solution_only_calls_builtins_taught_by_then(level_file):
    """What a level expects is already in its Codex: its reference only calls
    built-ins that a lesson up to it teaches (docs/Codex.md)."""
    taught = set().union(*(codex.taught(item["lesson"]) for item in codex.history(level_file.stem, chapters_in_play_order())))
    reference = (solutions_dir(level_file) / f"{level_file.stem}.py").read_text(encoding="utf-8")
    missing = codex.python_called(reference) - taught
    assert not missing, f"{level_file.stem}: its reference calls {sorted(missing)}, which no lesson up to it teaches"
