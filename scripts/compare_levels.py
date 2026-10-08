"""Check the level editor's draft code against the engine, level by level (src/editor/roundtrip.test.ts).

    node scripts/venv.mjs scripts.compare_levels <file.json>

The file maps a level id to {original, exported, info}: the level's data as `levels/` has it, the same level after
the editor read it as a draft and wrote it again, and what the editor would draw from the draft. For each level the
engine must describe `exported` exactly as it describes `original`, and `info`'s drawing fields must equal the
engine's. It prints counts and the names of fields that differ, never their values: a level's description holds
its hints (see CLAUDE.md: no spoilers).
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "engine"))

from rankfile.levels import parse_level  # noqa: E402

DRAWN = ("id", "title", "trains", "brief", "piece", "width", "height", "tiles", "signs", "runes", "questions", "enemies", "goal", "goal_spots")
DRAWN_START = ("pos", "facing", "opened", "crossed", "collected", "planks", "bridged", "enemies", "tick", "lost")


def differences(wanted: dict, got: dict, keys) -> list[str]:
    return [key for key in keys if wanted.get(key) != got.get(key)]


def main(path: str) -> int:
    levels = json.loads(Path(path).read_text(encoding="utf-8"))
    failures = []
    for level_id, entry in levels.items():
        wanted = parse_level(entry["original"]).describe()
        written = parse_level(entry["exported"]).describe()
        drawn = entry["info"]
        problems = [f"rewritten: {key}" for key in differences(wanted, written, wanted)]
        problems += [f"drawn: {key}" for key in differences(wanted, drawn, DRAWN)]
        problems += [f"drawn start: {key}" for key in differences(wanted["start"], drawn["start"], DRAWN_START)]
        gates = [{k: v for k, v in gate.items() if k != "text"} for gate in wanted["timed_gates"]]
        if gates != [{k: v for k, v in gate.items() if k != "text"} for gate in drawn["timed_gates"]]:
            problems.append("drawn: timed_gates")
        if problems:
            failures.append(f"{level_id}: {', '.join(problems)}")
    print(f"{len(levels)} levels checked, {len(failures)} differ")
    for line in failures:
        print(line)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
