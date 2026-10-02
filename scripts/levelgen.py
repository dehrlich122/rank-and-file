"""What the blind level generators share (gen_loops.py, gen_conditions.py): writing a
level's YAML and files, and checking how a wrong attempt fails. Nothing here
prints code: the designer is also the game's learner (see CLAUDE.md)."""

import codecs
import json
import sys
from collections.abc import Callable
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "engine"))  # so the generators, which import this first, can import the engine

from rankfile.constraints import code_lines  # noqa: E402
from rankfile.levels import Level, parse_level  # noqa: E402
from rankfile.runner import run_level  # noqa: E402

BUDGET = 400  # lines of player code a candidate may run before it counts as endless


def said(text: str) -> str:
    """Hints, notes and fixed lines of code are stored in ROT13, so the generators never show them."""
    return codecs.decode(text, "rot13")


# What a generator hands `build`: from the drafted level, the reference, a few words on
# its shape for the printout, and how to write each kind of wrong attempt. None if no
# program solves every board.
Writer = Callable[[Level], tuple[str, str, Callable[[str, Level], str]] | None]


def build(spec: dict, chapter: int, api: list[str], write: Writer) -> list[str]:
    """Generate one level: its reference (from `write`), its YAML with par and hint 3
    taken from the reference, its wrong attempts (each checked to fail) and its note.
    Returns any problems, in words, never code."""
    problems = []
    draft = parse_level(yaml.safe_load(yaml_text(spec, chapter=chapter, api=api, par=99, hints=["", "", ""])))
    made = write(draft)
    if made is None:
        return [f"{spec['id']}: no program solves every board"]
    reference, shape, wrong_code = made
    par = code_lines(reference)
    if par != spec["par"]:
        problems.append(f"{spec['id']}: the reference has {par} lines, the spec's par is {spec['par']}")
    hints = [*spec["hints"], third_hint(spec, reference)]
    text = yaml_text(spec, chapter=chapter, api=api, par=par, hints=hints)
    level = parse_level(yaml.safe_load(text))
    result = run_level(level, reference)
    stars = sum(star.earned for star in result.stars) if result.stars else 0
    print(f"{spec['id']} ({spec['title']}): par {par}, {shape}, reference {result.status}, {stars} stars")
    if result.status != "solved" or stars != 3:
        return [*problems, f"{spec['id']}: the reference isn't a three-star solve ({result.status})"]
    counts = {"lines": par}
    wrong = []
    for kind in spec["wrong"]:
        code = wrong_code(kind, level)
        counts[kind] = code_lines(code)
        expect = expect_line(level, code)
        print(f"  wrong attempt '{kind}': {counts[kind]} lines, {expect or 'SOLVED (a problem)'}")
        if expect is None:
            problems.append(f"{spec['id']}: the '{kind}' attempt solves the level")
        else:
            wrong.append(f"{expect}\n{code}")
    write_files(spec, chapter, text, reference, wrong, spec["note"].format(**counts))
    return problems


def run_all(levels: list[dict], build_one: Callable[[dict], list[str]], ids: list[str]) -> None:
    """Generate the levels named in `ids` (all of them if none), then report any problems."""
    problems = [problem for spec in levels if not ids or spec["id"] in ids for problem in build_one(spec)]
    for problem in problems:
        print(f"PROBLEM: {problem}")
    sys.exit(1 if problems else 0)


def main(levels: list[dict], build_one: Callable[[dict], list[str]], probe: Callable[[dict], None]) -> None:
    """A generator's command line: no arguments for every level, level ids for some, or `probe [ids]` to check the boards only."""
    args = sys.argv[1:]
    if args and args[0] == "probe":
        for spec in levels:
            if len(args) == 1 or spec["id"] in args[1:]:
                probe(spec)
    else:
        run_all(levels, build_one, args)


def third_hint(spec: dict, reference: str) -> str:
    """Hint 3, from the reference's own lines (spec["hint3"]): "start" (the first n
    lines), "loops" (up to and including the nth loop's first line), "key" (the first
    line containing a text) or "block" (that line and the lines indented under it)."""
    kind, *how = spec["hint3"]
    code = reference.splitlines()
    if kind == "start":
        return "One way to start:\n" + "\n".join(code[: how[0]])
    if kind == "loops":
        headers = [i for i, line in enumerate(code) if line.lstrip().startswith("for ")]
        return "One way to start:\n" + "\n".join(code[: headers[how[0] - 1] + 1])
    key, intro = how
    at = next(i for i, line in enumerate(code) if key in line)
    if kind == "key":
        return f"{intro}\n{code[at].strip()}"
    indent = len(code[at]) - len(code[at].lstrip())
    block = [code[at][indent:]]
    for line in code[at + 1 :]:
        if len(line) - len(line.lstrip()) <= indent:
            break
        block.append(line[indent:])
    return f"{intro}\n" + "\n".join(block)


def board_text(text: str) -> str:
    """A map written indented in a spec, as the level file holds it."""
    return "\n".join(line.strip() for line in text.strip("\n").splitlines()) + "\n"


def yaml_text(spec: dict, *, chapter: int, api: list[str], par: int, hints: list[str]) -> str:
    """A level file from a generator's spec. A board in `variants` is a map, or a
    dict with its map and its own legend and enemies."""
    q = json.dumps
    lines = [
        f"id: {spec['id']}",
        f"chapter: {chapter}",
        f"title: {q(spec['title'])}",
        f"trains: {q(spec['trains'])}",
        f"brief: {q(spec['brief'])}",
        "piece: pawn",
        "map: |",
        *[f"  {row}" for row in board_text(spec["map"]).splitlines()],
    ]
    if spec.get("legend"):
        lines.append(f"legend: {q(spec['legend'])}")
    if spec.get("enemies"):
        lines.append("enemies:")
        lines += [f"- {q(enemy)}" for enemy in spec["enemies"]]
    start = {"facing": spec["facing"], **({"planks": spec["planks"]} if spec.get("planks") else {})}
    lines.append(f"start: {q(start)}")
    lines.append(f"api: {q(api)}")
    rules = {}
    if spec.get("limit"):
        rules["max_lines"] = par + 2
    if spec.get("require"):
        rules["require_nodes"] = spec["require"]
    if rules:
        lines.append(f"constraints: {q(rules)}")
    lines.append(f"par: {q({'lines': par})}")
    lines.append("hints:")
    lines += [f"- {q(hint)}" for hint in hints]
    lines.append(f"lesson: ch{chapter:02d}/{spec['id']}.md")
    if spec.get("mastery"):
        lines.append("mastery: true")
    if "lesson_board" in spec:
        board = spec["lesson_board"]
        lines += ["lesson_board:", "  map: |", *[f"    {row}" for row in board["map"].splitlines()]]
        lines += [f"  {key}: {q(board[key])}" for key in ("legend", "enemies", "start") if key in board]
    if spec.get("variants"):
        lines.append("variants:")
        for variant in spec["variants"]:
            variant = variant if isinstance(variant, dict) else {"map": variant}
            lines += ["- map: |", *[f"    {row}" for row in board_text(variant["map"]).splitlines()]]
            lines += [f"  {key}: {q(variant[key])}" for key in ("legend", "enemies") if key in variant]
    return "\n".join(lines) + "\n"


def expect_line(level: Level, code: str) -> str | None:
    """A wrong attempt's first line, `# expect: <outcome> [ErrorType]`, or None if it solves the level."""
    result = run_level(level, code)
    if result.status == "solved":
        return None
    error = f" {result.error.type}" if result.status == "error" and result.error else ""
    return f"# expect: {result.status}{error}"


def save(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")
    print(f"  {path.relative_to(ROOT).as_posix()}")


def write_files(spec: dict, chapter: int, level_yaml: str, reference: str, wrong: list[str], note: str) -> None:
    """The level file, its reference, its wrong attempts (replacing any old ones) and its note."""
    folder = ROOT / "solutions" / f"ch{chapter:02d}"
    save(ROOT / "levels" / f"ch{chapter:02d}" / f"{spec['id']}.yaml", level_yaml)
    save(folder / f"{spec['id']}.py", reference)
    for old in folder.glob(f"{spec['id']}.naive*.py"):
        old.unlink()
    for number, code in enumerate(wrong, start=1):
        save(folder / f"{spec['id']}.naive{'' if number == 1 else number}.py", code)
    save(folder / f"{spec['id']}.md", note + "\n")
