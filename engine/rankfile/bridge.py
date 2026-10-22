"""The only module the browser's Web Worker calls into.

Every function takes plain strings (JSON where the data is structured) or
numbers, and returns a JSON string. Keeping the boundary this simple means JavaScript never
holds references to Python objects, and everything else in the engine stays
ordinary Python.
"""

import json

from . import runner
from .codex import entries as codex_entries
from .constraints import code_lines as count_code_lines
from .levels import LevelError, parse_level, sandbox_level
from .levels import editor_options as level_editor_options
from .repl import Repl
from .search import Search

_repl = Repl()
_search: Search | None = None  # the solvability check in progress (M4.3); starting another replaces it


def run_snippet(code: str) -> str:
    return json.dumps(runner.run_snippet(code).to_dict())


def load_level(level_json: str) -> str:
    """Check a level and describe it for drawing. Returns {"ok": true, "level": ...} or {"ok": false, "error": ...}."""
    try:
        level = parse_level(json.loads(level_json))
    except LevelError as exc:
        return json.dumps({"ok": False, "error": str(exc), "at": exc.at})
    return json.dumps({"ok": True, "level": level.describe()})


def editor_options() -> str:
    """What the level editor offers (levels.editor_options)."""
    return json.dumps(level_editor_options())


def solve_start(level_json: str) -> str:
    """Begin the solvability check of a level (search.py). Returns {"ok": true, "cases": n} or {"ok": false, "error": ...}."""
    global _search
    try:
        _search = Search(parse_level(json.loads(level_json)))
    except LevelError as exc:
        _search = None
        return json.dumps({"ok": False, "error": str(exc)})
    return json.dumps({"ok": True, "cases": len(_search.cases)})


def solve_step(seconds: float = 0.15) -> str:
    """Work on the check for about `seconds`, then report how far it got (counts and words, never the route)."""
    global _search
    if _search is None:
        return json.dumps({"done": True, "case": 0, "cases": 0, "unit": "board", "positions": 0, "results": []})
    progress = _search.step(float(seconds))
    if progress["done"]:
        _search = None  # an answer is given once; asking again gets "nothing running"
    return json.dumps(progress)


def run_level(level_json: str, code: str, hints_used: int = 0, solution_seen: bool = False) -> str:
    level = parse_level(json.loads(level_json))
    result = runner.run_level(level, code, hints_used=int(hints_used), solution_seen=bool(solution_seen))
    return json.dumps(result.to_dict())


def code_lines(code: str) -> str:
    """How many lines of code the engine counts in `code`, as par and `max_lines` count them (M4.3: an author's solution)."""
    return json.dumps(count_code_lines(code))


def load_sandbox(api_json: str, board_json: str = "null") -> str:
    return json.dumps(sandbox_level(json.loads(api_json), lesson_board=json.loads(board_json)).describe())


def run_sandbox(code: str, api_json: str, board_json: str = "null") -> str:
    return json.dumps(runner.run_sandbox(code, json.loads(api_json), lesson_board=json.loads(board_json)).to_dict())


def codex(level_id: str, chapters_json: str) -> str:
    """A level's Codex entries (docs/Codex.md). `chapters`: every chapter's levels and lessons, in play order."""
    return json.dumps([entry.to_dict() for entry in codex_entries(level_id, json.loads(chapters_json))])


def repl_push(line: str, level_json: str) -> str:
    """One line for the scratch REPL. `level` is {"piece", "api"} for the session's stand-in piece, or null."""
    return json.dumps(_repl.push(line, **(json.loads(level_json) or {})))


def repl_reset() -> str:
    _repl.reset()
    return json.dumps({"ok": True})
