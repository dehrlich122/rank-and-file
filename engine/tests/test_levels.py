"""The level checker: every level file, lesson and solution, checked automatically.

For each level (levels/<folder>/<id>.yaml: a chapter, chNN, or practice) it checks that:
- the level file is valid and its id matches its file name;
- the reference solution (solutions/chNN/<id>.py) solves it;
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

import ast
import builtins
import re
from pathlib import Path

import pytest
import yaml

from rankfile import codex
from rankfile.levels import parse_level
from rankfile.runner import run_level, run_sandbox

ROOT = Path(__file__).resolve().parents[2]
LEVEL_FILES = sorted((ROOT / "levels").glob("*/*.yaml"))
MAX_LESSON_WORDS = 150
SNIPPET = re.compile(r"^```python run(?: (error|lost))?\n(.*?)^```", re.MULTILINE | re.DOTALL)
FENCED = re.compile(r"^```.*?^```", re.MULTILINE | re.DOTALL)


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
    assert {load(path).chapter for path in LEVEL_FILES} <= chapters


def test_level_file_is_valid(level_file):
    level = load(level_file)
    assert level.id == level_file.stem
    assert level.hints, "every level needs hints"
    assert level.par.lines, "every level needs a line par, for its par star"


def test_reference_solution_solves_it(level_file):
    level = load(level_file)
    solution = solutions_dir(level_file) / f"{level.id}.py"
    result = run_level(level, solution.read_text(encoding="utf-8"))
    # Deliberately not printing the solution: the checker must never spoil it.
    assert result.status == "solved", f"{level.id}: {result.summary}"
    # ...and it earns every star, so each level's par is reachable.
    assert all(star.earned for star in result.stars), f"{level.id}: {[star.label for star in result.stars]}"


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


def test_lesson_is_short_and_runnable(level_file):
    level = load(level_file)
    text = (ROOT / "lessons" / level.lesson).read_text(encoding="utf-8")

    prose = FENCED.sub("", text)
    words = re.findall(r"[A-Za-z0-9_']+", prose)
    assert len(words) <= MAX_LESSON_WORDS, f"{level.lesson} has {len(words)} words of prose"

    snippets = SNIPPET.findall(text)
    assert 1 <= len(snippets) <= 3, f"{level.lesson} needs 1-3 runnable snippets"
    for meant, code in snippets:
        result = run_sandbox(code, level.api, lesson_board=level.lesson_board)
        if meant:
            assert result.status == meant, f"snippet should end in {meant} on purpose, not {result.status}:\n{code}"
        else:
            assert result.status == "finished", f"snippet failed ({result.summary}):\n{code}"


# -- the Codex (docs/Codex.md) -------------------------------------------------------


def lesson_snippets(level) -> list[str]:
    return [code for _, code in SNIPPET.findall((ROOT / "lessons" / level.lesson).read_text(encoding="utf-8"))]


def builtins_called(code: str) -> set[str]:
    """The Python built-ins `code` calls by name (print, range, ...)."""
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return set()  # a lesson snippet that's meant to be a syntax error
    return {node.func.id for node in ast.walk(tree) if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and hasattr(builtins, node.func.id)}


def codex_history(level_file: Path) -> list[Path]:
    """The level files that count towards a level's Codex, "taught so far". Mirrors
    content.codexHistory: every curriculum level before it in play order
    (chapters.yaml, then each chapter's levels by id), then its own chapter's
    levels up to it."""
    chapters = yaml.safe_load((ROOT / "levels" / "chapters.yaml").read_text("utf-8"))
    levels_of = {entry["chapter"]: sorted((path for path in LEVEL_FILES if load(path).chapter == entry["chapter"]), key=lambda path: path.stem) for entry in chapters}
    own = load(level_file).chapter
    counted: list[Path] = []
    for entry in chapters:
        if entry["chapter"] == own:
            return counted + levels_of[own][: levels_of[own].index(level_file) + 1]
        if entry.get("curriculum", True):
            counted += levels_of[entry["chapter"]]
    return counted


def test_lesson_builtins_have_codex_entries(level_file):
    """Every built-in a lesson calls is documented, so the Codex can list it."""
    level = load(level_file)
    missing = set().union(*map(builtins_called, lesson_snippets(level))) - set(codex.BUILTINS)
    assert not missing, f"{level.lesson} calls {sorted(missing)}: document them in codex.BUILTINS"


def test_reference_solution_only_calls_builtins_taught_by_then(level_file):
    """What a level expects is already in its Codex: its reference only calls
    built-ins that a lesson up to it teaches (docs/Codex.md)."""
    level = load(level_file)
    taught = {name for path in codex_history(level_file) for name in codex.taught(lesson_snippets(load(path)))}
    reference = (solutions_dir(level_file) / f"{level.id}.py").read_text(encoding="utf-8")
    missing = builtins_called(reference) - taught
    assert not missing, f"{level.id}: its reference calls {sorted(missing)}, which no lesson up to it teaches"
