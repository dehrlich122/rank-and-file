"""Chapter 6's levels (M3.6): drafts, and `probe` to check them.

    .venv/Scripts/python scripts/gen_runes.py probe [ch06-l02]   # only check the boards

A level is one level on four boards, and one program has to solve them all. The
runes' text differs between boards, so the answer has to be worked out in code.
`probe` makes the case for each level with counts, never code: the designer is also
the game's learner (see CLAUDE.md: no spoilers).

- A guard's answer is searched as an expression over the rune's text, bottom-up with
  equal results merged, so the search is cheap. For each family of tools it prints
  the number of operations in the smallest expression that gives every board's
  answer, or "none". The families are what the lessons have taught by that level.
- A choice between roads is searched as a yes/no question about the text.
- A destination in numbers, and a route written in text, are checked on the boards.

Nothing in this file is a level's solution: the grammar below is the same for every
level, and the answers are data (the words the runes and the guards say).
"""

import re
import sys
from itertools import product

import yaml
from levelgen import yaml_text

from rankfile.levels import Level, parse_level
from rankfile.runner import run_level

CHAPTER = 6
MAX_SIZE = 6  # operations in a searched expression
BUDGET = 400  # lines of player code a candidate may run before it counts as endless

# -- drafting boards -------------------------------------------------------------------


def rune(text: str) -> dict:
    return {"tile": "rune", "text": text}


def guard(question: str, answer: str) -> dict:
    return {"tile": "gate", "question": question, "passphrase": answer}


def corridor(*rows: str) -> str:
    """A corridor between walls, one row of the board per argument, top rank first."""
    return "\n".join(f"# {row} #" for row in rows) + "\n"


def field(width: int, height: int, **squares: tuple[int, int]) -> str:
    """An open board; `squares` names where P, R, G (and O for a pit) go, as (x, y) from a1."""
    grid = [["."] * width for _ in range(height)]
    for symbol, (x, y) in squares.items():
        grid[height - 1 - y][x] = symbol
    return "\n".join(" ".join(row) for row in grid) + "\n"


def crossroads(good: str) -> str:
    """A 9x9 board: a stem from the start up to a junction, with a road of four squares
    to the left, to the right and straight on. The goal is at the end of the `good` road
    ("left", "right" or "ahead"), and a pit at the end of each of the others."""
    grid = [["#"] * 9 for _ in range(9)]
    for y in range(5):
        grid[8 - y][4] = "."
    for x in range(9):
        grid[4][x] = "."
    for y in range(5, 9):
        grid[8 - y][4] = "."
    ends = {"left": (0, 4), "right": (8, 4), "ahead": (4, 8)}
    for road, (x, y) in ends.items():
        grid[8 - y][x] = "G" if road == good else "O"
    grid[8][4], grid[7][4] = "P", "R"
    return "\n".join(" ".join(row) for row in grid) + "\n"


def walk(route: str, start: tuple[int, int], facing: str = "north") -> tuple[int, int]:
    """Where a route written as text (like "R4,L3") ends, and the squares along it are all on a field."""
    x, y = start
    heading = ["north", "east", "south", "west"].index(facing)
    for leg in route.split(","):
        heading = (heading + (1 if leg[0] == "R" else -1)) % 4
        dx, dy = [(0, 1), (1, 0), (0, -1), (-1, 0)][heading]
        x, y = x + dx * int(leg[1:]), y + dy * int(leg[1:])
    return x, y


def route_calls(route: str) -> str:
    """A route written as text, typed out as plain calls: the attempt that fits one board only."""
    lines = []
    for leg in route.split(","):
        lines += [f"pawn.turn_{'right' if leg[0] == 'R' else 'left'}()", f"pawn.move({leg[1:]})"]
    return "\n".join(lines) + "\n"


def typed_code(spec: dict, board: dict) -> str:
    """The attempt that fits one board only: its own moves and its own answers, typed out as plain
    calls. It shows that a board can be solved, and that no board's attempt works on all of them."""
    kind = spec["kind"]
    if kind == "route":
        return "pawn.move()\n" + route_calls(board["rune"])
    if kind == "destination":
        first, second = board["rune"].split(",")
        return f"pawn.move({1 + int(first)})\npawn.turn_left()\npawn.move({second})\n"
    if kind == "fork":
        turn = {"left": "pawn.turn_left()\n", "right": "pawn.turn_right()\n", "ahead": ""}[board["good"]]
        return f"pawn.move(4)\n{turn}pawn.move(4)\n"
    rows = [row.split()[1] for row in spec["map"].splitlines()]  # the corridor's middle column, top rank first
    where = {symbol: len(rows) - 1 - rows.index(symbol) for symbol in "PRABG"}  # y of each square
    stops = [(where["A"] - 1, "A"), (where["B"] - 1, "B"), (where["G"], None)]
    lines, at = [], where["P"]
    for y, gate in stops:
        lines.append(f"pawn.move({y - at})")
        at = y
        if gate:
            lines.append(f"print({board[gate]!r})")
    return "\n".join(lines) + "\n"


def reach(spec: dict) -> str:
    """How far each board's typed attempt gets: how many boards it solves, fewest to most."""
    boards = [case.level for case in draft(spec).cases()]
    solved = []
    for board in spec["boards"]:
        code = typed_code(spec, board)
        solved.append([run_level(level, code, line_budget=BUDGET, enforce_constraints=False).status == "solved" for level in boards])
    own = all(row[number] for number, row in enumerate(solved))
    return f"each board's own attempt solves its own board: {own}; and {min(map(sum, solved)) - 1} to {max(map(sum, solved)) - 1} others"


# -- the searchable expressions over a rune's text -----------------------------------------

FAMILIES = {  # what an expression may use: each is a set of operations
    "reading only": {"read"},
    "indexing": {"read", "index"},
    "indexing and slicing": {"read", "index", "slice"},
    "methods": {"read", "method"},
    "methods and slicing": {"read", "index", "slice", "method"},
    "everything": {"read", "index", "slice", "method", "split"},
}
INDEXES = [0, 1, 2, -1, -2, -3]
BOUNDS = [None, 1, 2, 3, 4, 5, 6, -1, -2, -3, -4, -5]
SWAPS = [(" ", ""), ("-", " "), ("-", ""), (":", ""), (",", " "), (" ", "-")]  # what replace() is tried with
SEPARATORS = [" ", "-", ":", ","]


def operations(family: set[str]) -> list:
    """The one-step changes to a text that a family allows, each a function of the text."""
    steps = []
    if "index" in family:
        steps += [lambda s, i=i: s[i] for i in INDEXES]
    if "slice" in family:
        steps += [lambda s, a=a, b=b: s[a:b] for a, b in product(BOUNDS, repeat=2)]
    if "method" in family:
        steps += [lambda s, name=name: getattr(s, name)() for name in ("upper", "lower", "strip")]
        steps += [lambda s, old=old, new=new: s.replace(old, new) for old, new in SWAPS]
    if "split" in family:
        steps += [lambda s, sep=sep, i=i: s.split(sep)[i] for sep, i in product(SEPARATORS, [0, 1, -1])]
    return steps


def search(texts: list[str], answers: list[str], family: set[str]) -> int | None:
    """The fewest operations of an expression over the text that gives each board's answer, or None."""
    target, start = tuple(answers), tuple(texts)
    if start == target:
        return 0
    steps = operations(family)
    seen = {start}
    latest = [start]  # what the last round found: the values of the expressions that many operations long
    for size in range(1, MAX_SIZE + 1):
        found = []
        for values in latest:
            for step in steps:
                changed = _each(values, step)
                if changed is not None and changed not in seen:
                    seen.add(changed)
                    found.append(changed)
        if target in found:
            return size
        latest = found
    return None


def _each(values: tuple, function) -> tuple | None:
    try:
        return tuple(function(value) for value in values)
    except (IndexError, ValueError):
        return None


def sizes(texts: list[str], answers: list[str]) -> str:
    cells = []
    for name, family in FAMILIES.items():
        size = search(texts, answers, family)
        cells.append(f"{name}: {size if size is not None else 'none'}")
    return "; ".join(cells)


# -- the levels --------------------------------------------------------------------------------
# kind "guards": a rune, and gates that ask for something worked out from it.
# kind "fork": a rune that says which road is safe.
# kind "destination": a rune that says how far to go, in numbers.
# kind "route": a rune that writes the whole route.

LEVELS: list[dict] = [
    {
        "id": "ch06-l01",
        "title": "The Runestone",
        "trains": "Reading a rune: read(), a variable holding text, and indexing one character",
        "brief": "A rune is a stone with writing on it. Stand on it, and your pawn can read it.",
        "api": ["move", "read"],
        "kind": "guards",
        "map": corridor("G", ".", "B", ".", "A", "R", ".", "P"),
        "questions": {"A": "What does the rune say?", "B": "What is the first letter of the rune?"},
        "boards": [
            {"rune": "ember", "A": "ember", "B": "e"},
            {"rune": "willow", "A": "willow", "B": "w"},
            {"rune": "oracle", "A": "oracle", "B": "o"},
            {"rune": "tin", "A": "tin", "B": "t"},
        ],
    },
    {
        "id": "ch06-l02",
        "title": "Cut It Out",
        "trains": "Slicing text: a stretch of it from the start, the end or the middle",
        "brief": "Every rune here starts with a label. The guards want only part of what it says.",
        "api": ["move", "read"],
        "kind": "guards",
        "map": corridor("G", ".", "B", ".", "A", "R", ".", "P"),
        "questions": {"A": "What is the word after the label?", "B": "What are the last three letters of that word?"},
        "boards": [
            {"rune": "key:amber", "A": "amber", "B": "ber"},
            {"rune": "key:willow", "A": "willow", "B": "low"},
            {"rune": "key:crimson", "A": "crimson", "B": "son"},
            {"rune": "key:lantern", "A": "lantern", "B": "ern"},
        ],
    },
    {
        "id": "ch06-l03",
        "title": "Smudged Runes",
        "trains": "Methods of text: strip(), upper(), lower() and replace()",
        "brief": "The runes are smudged: stray spaces, wrong capitals, dashes for spaces. The guards want them tidy.",
        "api": ["move", "read"],
        "kind": "guards",
        "map": corridor("G", ".", "B", ".", "A", "R", ".", "P"),
        "questions": {
            "A": "What does the rune say, in capitals, without the stray spaces?",
            "B": "Now in small letters, with a space where each dash was?",
        },
        "boards": [
            {"rune": "  Silver-Moon  ", "A": "SILVER-MOON", "B": "silver moon"},
            {"rune": "Ghost-LANTERN ", "A": "GHOST-LANTERN", "B": "ghost lantern"},
            {"rune": " iron-gate", "A": "IRON-GATE", "B": "iron gate"},
            {"rune": "OLD-bridge ", "A": "OLD-BRIDGE", "B": "old bridge"},
        ],
    },
    {
        "id": "ch06-l04",
        "title": "Which Road?",
        "trains": "Asking text a question: `in`, startswith() and endswith(), find() and count()",
        "brief": "At the crossroads, two roads end in pits. A rune on the way says which road is safe.",
        "api": ["move", "turn_left", "turn_right", "read"],
        "kind": "fork",
        "legend": {"O": "pit"},
        "boards": [
            {"rune": "The old road to the left is the safe one.", "good": "left"},
            {"rune": "Keep to the right, traveller. The other roads end in thorns.", "good": "right"},
            {"rune": "Straight on is the only safe road.", "good": "ahead"},
            {"rune": "Take the left road, friend, and fear nothing.", "good": "left"},
        ],
    },
    {
        "id": "ch06-l05",
        "title": "Where the Rune Points",
        "trains": "Text into numbers: int(), split() and indexing the pieces",
        "brief": "The goal is somewhere out in the open. The rune says how far: first east, then north.",
        "api": ["move", "turn_left", "read"],
        "kind": "destination",
        "boards": [
            {"rune": "10,3"},
            {"rune": "4,10"},
            {"rune": "7,2"},
            {"rune": "9,4"},
        ],
    },
    {
        "id": "ch06-l06",
        "title": "The Written Route",
        "trains": "Everything on text: a whole route written on a rune, followed one leg at a time",
        "brief": "A rune writes out the whole route: L or R for the turn, then the number of squares. Follow it to the goal.",
        "api": ["move", "turn_left", "turn_right", "read"],
        "kind": "route",
        "mastery": True,
        "boards": [
            {"rune": "R4,L3"},
            {"rune": "L3,R5,L2"},
            {"rune": "R2,L4,R2,L1"},
            {"rune": "R1,L5,R2,L2,R1"},
        ],
    },
]


# -- turning a spec into boards ----------------------------------------------------------------

DESTINATION_SIZE = (12, 12)  # width, height
ROUTE_SIZE = (11, 11)
ROUTE_START = (5, 0)  # the pawn; the rune is on the square ahead of it


def boards_for(spec: dict) -> list[tuple[str, dict]]:
    """Each board of a level as (its map, its legend)."""
    boards = []
    for board in spec["boards"]:
        legend = {**spec.get("legend", {}), "R": rune(board["rune"])}
        if spec["kind"] == "guards":
            legend |= {symbol: guard(question, board[symbol]) for symbol, question in spec["questions"].items()}
            text = spec["map"]
        elif spec["kind"] == "fork":
            text = crossroads(board["good"])
        elif spec["kind"] == "destination":
            first, second = (int(part) for part in board["rune"].split(","))
            width, height = DESTINATION_SIZE
            text = field(width, height, P=(0, 0), R=(1, 0), G=(1 + first, second))
        else:
            width, height = ROUTE_SIZE
            x, y = ROUTE_START
            text = field(width, height, P=(x, y), R=(x, y + 1), G=walk(board["rune"], (x, y + 1)))
        boards.append((text, legend))
    return boards


def draft(spec: dict) -> Level:
    """The level as drafted, with par and hints blank, to check its boards parse and read well."""
    boards = boards_for(spec)
    facing = "east" if spec["kind"] == "destination" else "north"
    drawn = {
        **spec,
        "facing": facing,
        "map": boards[0][0],
        "legend": boards[0][1],
        "variants": [{"map": text, "legend": legend} for text, legend in boards[1:]],
    }
    return parse_level(yaml.safe_load(yaml_text(drawn, chapter=CHAPTER, api=spec["api"], par=99, hints=["", "", ""])))


# -- probe ---------------------------------------------------------------------------------------


def words(text: str) -> list[str]:
    return sorted(set(re.findall(r"[a-z]+", text.lower())))


def probe_fork(spec: dict) -> None:
    texts = [board["rune"] for board in spec["boards"]]
    for road in ("left", "right"):
        wanted = [board["good"] == road for board in spec["boards"]]
        pool = sorted({word for text in texts for word in words(text)})
        tests = {
            "in": lambda w, t: w in t,
            "startswith": lambda w, t: t.startswith(w),
            "endswith": lambda w, t: t.endswith(w),
            "==": lambda w, t: t == w,
        }
        cells = []
        for name, test in tests.items():
            works = [word for word in pool if [test(word, text) for text in texts] == wanted]
            cells.append(f"{name}: {len(works)} of {len(pool)} words")
        print(f"  telling the {road} boards apart: {'; '.join(cells)}")
    # both words in one text would make `in` mislead
    both = [text for text in texts if "left" in text and "right" in text]
    print(f"  runes that mention both left and right: {len(both)}")


def probe_destination(spec: dict) -> None:
    texts = [board["rune"] for board in spec["boards"]]
    first = [text.split(",")[0] for text in texts]
    second = [text.split(",")[1] for text in texts]
    print(f"  the first number, as text: {sizes(texts, first)}")
    print(f"  the second number, as text: {sizes(texts, second)}")
    width, height = DESTINATION_SIZE
    print(f"  the board is {width} by {height}; the largest first number is {max(int(n) for n in first)}")


def probe_route(spec: dict) -> None:
    texts = [board["rune"] for board in spec["boards"]]
    legs = [len(text.split(",")) for text in texts]
    print(f"  legs on each board: {legs}")
    width, height = ROUTE_SIZE
    x0, y0 = ROUTE_START
    ends = [walk(text, (x0, y0 + 1)) for text in texts]
    inside = all(0 <= x < width and 0 <= y < height for x, y in ends)
    print(f"  every board's goal is on the board: {inside}; the goals differ: {len(set(ends)) == len(ends)}")


def probe(spec: dict) -> None:
    level = draft(spec)
    texts = [board["rune"] for board in spec["boards"]]
    print(f"{spec['id']} ({spec['title']}): {len(level.cases())} boards; the runes differ: {len(set(texts)) == len(texts)}")
    print(f"  {reach(spec)}")
    if spec["kind"] == "guards":
        for gate in spec["questions"]:
            print(f"  guard {gate} ({sizes(texts, [board[gate] for board in spec['boards']])})")
    else:
        {"fork": probe_fork, "destination": probe_destination, "route": probe_route}[spec["kind"]](spec)


if __name__ == "__main__":
    args = sys.argv[1:]
    if args and args[0] == "probe":
        for level_spec in LEVELS:
            if len(args) == 1 or level_spec["id"] in args[1:]:
                probe(level_spec)
    else:
        sys.exit("only `probe` for now: the writer comes with the approved specs")
