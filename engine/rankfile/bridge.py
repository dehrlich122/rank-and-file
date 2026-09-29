"""The only module the browser's Web Worker calls into.

Every function takes plain strings (JSON where the data is structured) or
numbers, and returns a JSON string. Keeping the boundary this simple means JavaScript never
holds references to Python objects, and everything else in the engine stays
ordinary Python.
"""

import json

from . import runner
from .codex import entries as codex_entries
from .levels import LevelError, parse_level, sandbox_level
from .repl import Repl

_repl = Repl()


def run_snippet(code: str) -> str:
    return json.dumps(runner.run_snippet(code).to_dict())


def load_level(level_json: str) -> str:
    """Check a level and describe it for drawing. Returns {"ok": true, "level": ...} or {"ok": false, "error": ...}."""
    try:
        level = parse_level(json.loads(level_json))
    except LevelError as exc:
        return json.dumps({"ok": False, "error": str(exc)})
    return json.dumps({"ok": True, "level": level.describe()})


def run_level(level_json: str, code: str, hints_used: int = 0, solution_seen: bool = False) -> str:
    level = parse_level(json.loads(level_json))
    result = runner.run_level(level, code, hints_used=int(hints_used), solution_seen=bool(solution_seen))
    return json.dumps(result.to_dict())


def load_sandbox(api_json: str, board_json: str = "null") -> str:
    return json.dumps(sandbox_level(json.loads(api_json), lesson_board=json.loads(board_json)).describe())


def run_sandbox(code: str, api_json: str, board_json: str = "null") -> str:
    return json.dumps(runner.run_sandbox(code, json.loads(api_json), lesson_board=json.loads(board_json)).to_dict())


def codex(piece: str, api_json: str, history_json: str) -> str:
    """A level's Codex entries (docs/Codex.md). `history` is the levels that count, ending with this one."""
    return json.dumps([entry.to_dict() for entry in codex_entries(piece, json.loads(api_json), json.loads(history_json))])


def repl_push(line: str, piece: str = "", api_json: str = "[]") -> str:
    """One line for the scratch REPL. `piece` and `api` are the level's, for the session's stand-in piece."""
    return json.dumps(_repl.push(line, piece or None, json.loads(api_json)))


def repl_reset() -> str:
    _repl.reset()
    return json.dumps({"ok": True})
