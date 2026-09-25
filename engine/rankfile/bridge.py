"""The only module the browser's Web Worker calls into.

Each function takes plain strings and returns a JSON string. Keeping the
boundary this simple means JavaScript never holds references to Python
objects, and everything else in the engine stays ordinary Python.
"""

import json

from . import runner


def run_snippet(code: str) -> str:
    return json.dumps(runner.run_snippet(code).to_dict())
