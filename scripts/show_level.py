"""Prints a level file with its spoilers hidden (docs/WORKFLOW.md):

    node scripts/venv.mjs scripts.show_level ch04-l02
    node scripts/venv.mjs scripts.show_level levels/ch04/ch04-l02.yaml

Hints, guard passphrases and a kept solution are replaced by a note saying how many there
were, so the board, rules and objectives can be read in a transcript the designer sees.
Never print a level any other way (the spoiler-guard hook blocks reading levels/ directly).
"""

import sys
from pathlib import Path

import yaml

HIDDEN = {"hints", "passphrase", "solution"}
ROOT = Path(__file__).resolve().parent.parent


def redact(node):
    if isinstance(node, dict):
        return {key: hidden(key, value) if key in HIDDEN else redact(value) for key, value in node.items()}
    if isinstance(node, list):
        return [redact(item) for item in node]
    return node


def hidden(key, value):
    if isinstance(value, list):
        return f"<{len(value)} {key} hidden>"
    return f"<{key} hidden>"


def find(name):
    path = Path(name)
    if path.suffix == ".yaml":
        return path if path.is_absolute() else ROOT / path
    matches = sorted((ROOT / "levels").rglob(f"{name}.yaml"))
    if not matches:
        sys.exit(f"show_level: no level called {name}")
    return matches[0]


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: node scripts/venv.mjs scripts.show_level <level-id or levels/... .yaml>")
    level = yaml.safe_load(find(sys.argv[1]).read_text(encoding="utf-8"))
    print(yaml.safe_dump(redact(level), sort_keys=False, allow_unicode=True, width=120), end="")


if __name__ == "__main__":
    main()
