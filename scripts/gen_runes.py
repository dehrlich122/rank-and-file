"""Write Chapter 6's levels, reference solutions and wrong attempts blind (M3.6).

    .venv/Scripts/python scripts/gen_runes.py                  # every level below
    .venv/Scripts/python scripts/gen_runes.py ch06-l02         # just one
    .venv/Scripts/python scripts/gen_runes.py probe [ch06-l02] # only check the boards

A level is one level on four boards, and one program has to solve them all. The
runes' text differs between boards, so the answer has to be worked out in code.

How a reference is written, with no one reading it:
- A guard's answer is searched as an expression over the rune's text, bottom-up
  with equal results merged. The tools allowed are the ones the lessons have
  taught by that level. The smallest expression that gives every board's answer
  wins, and a text can be tidied once into a variable if that is smaller overall.
- A choice between roads is a yes/no question about the text; the conditions come
  from the tools a lesson teaches, and the first that tells the boards apart wins.
- A destination in numbers and a route written in text are cut at the separator
  that works, and every expression is checked on boards that aren't in the level.
- The walk between the stops comes from the board's own geometry.
The few fixed lines of code (the loop, the reading) are stored in ROT13, as the hints
and notes are, so that nothing here shows a solution: `code()` decodes them. The
generator prints counts and outcomes only; the designer is also the game's learner
(see CLAUDE.md: no spoilers).

`probe` is for designing a level: for each family of tools it prints the number of
operations in the smallest expression that gives every board's answer, and how far a
board's own typed attempt gets.
"""

import codecs
import json
import re
from itertools import product

import yaml
from levelgen import build, main, yaml_text

from rankfile.levels import Level, parse_level
from rankfile.runner import run_level

CHAPTER = 6
MAX_SIZE = 6  # operations in a searched expression
BUDGET = 400  # lines of player code a candidate may run before it counts as endless


def said(text: str) -> str:
    return codecs.decode(text, "rot13")


code = said  # the fixed lines of code below are stored the same way

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
    for y in range(9):
        grid[8 - y][4] = "."
    for x in range(9):
        grid[4][x] = "."
    for road, (x, y) in {"left": (0, 4), "right": (8, 4), "ahead": (4, 8)}.items():
        grid[8 - y][x] = "G" if road == good else "O"
    grid[8][4], grid[7][4] = "P", "R"
    return "\n".join(" ".join(row) for row in grid) + "\n"


def walk(route: str, start: tuple[int, int], facing: str = "north") -> tuple[int, int]:
    """Where a route written as text (like "R4,L3") ends."""
    x, y = start
    heading = ["north", "east", "south", "west"].index(facing)
    for leg in route.split(","):
        heading = (heading + (1 if leg[0] == "R" else -1)) % 4
        dx, dy = [(0, 1), (1, 0), (0, -1), (-1, 0)][heading]
        x, y = x + dx * int(leg[1:]), y + dy * int(leg[1:])
    return x, y


def move(squares: int) -> str:
    return "pawn.move()" if squares == 1 else f"pawn.move({squares})"


def route_calls(route: str) -> str:
    """A route written as text, typed out as plain calls: the attempt that fits one board only."""
    lines = []
    for leg in route.split(","):
        lines += [f"pawn.turn_{'right' if leg[0] == 'R' else 'left'}()", move(int(leg[1:]))]
    return "\n".join(lines) + "\n"


def stops(spec: dict) -> list[tuple[int, str | None]]:
    """A corridor level's walk: the rank to stand on to say each gate's answer, then the goal's."""
    rows = [row.split()[1] for row in spec["map"].splitlines()]  # the corridor's middle column, top rank first
    where = {symbol: len(rows) - 1 - rows.index(symbol) for symbol in "PRABG"}
    return [(where["P"], None), (where["A"] - 1, "A"), (where["B"] - 1, "B"), (where["G"], None)]


def typed_code(spec: dict, board: dict) -> str:
    """The attempt that fits one board only: its own moves and its own answers, typed out as plain
    calls. It shows that a board can be solved, and that no board's attempt works on all of them."""
    kind = spec["kind"]
    if kind == "route":
        return "pawn.move()\n" + route_calls(board["rune"])
    if kind == "destination":
        first, second = board["rune"].split(",")
        return f"{move(1 + int(first))}\npawn.turn_left()\n{move(int(second))}\n"
    if kind == "fork":
        turn = {"left": "pawn.turn_left()\n", "right": "pawn.turn_right()\n", "ahead": ""}[board["good"]]
        return f"pawn.move(4)\n{turn}pawn.move(4)\n"
    lines = []
    for (here, _), (there, gate) in zip(stops(spec), stops(spec)[1:], strict=False):
        lines.append(move(there - here))
        if gate:
            lines.append(f"print({board[gate]!r})")
    return "\n".join(lines) + "\n"


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
SEPARATORS = [",", " ", "-", ":"]


def operations(family: set[str]) -> list[tuple[str, object, object]]:
    """The one-step changes to a text that a family allows, as (kind, what it does, how it reads)."""
    steps: list[tuple[str, object, object]] = []
    if "index" in family:
        steps += [("index", lambda s, i=i: s[i], lambda src, i=i: f"{src}[{i}]") for i in INDEXES]
    if "slice" in family:
        steps += [
            ("slice", lambda s, a=a, b=b: s[a:b], lambda src, a=a, b=b: f"{src}[{'' if a is None else a}:{'' if b is None else b}]")
            for a, b in product(BOUNDS, repeat=2)
        ]
    if "method" in family:
        steps += [("method", lambda s, name=name: getattr(s, name)(), lambda src, name=name: f"{src}.{name}()") for name in ("strip", "upper", "lower")]
        steps += [
            ("method", lambda s, old=old, new=new: s.replace(old, new), lambda src, old=old, new=new: f"{src}.replace({json.dumps(old)}, {json.dumps(new)})")
            for old, new in SWAPS
        ]
    if "split" in family:
        steps += [
            ("split", lambda s, sep=sep, i=i: s.split(sep)[i], lambda src, sep=sep, i=i: f"{src}.split({json.dumps(sep)})[{i}]")
            for sep, i in product(SEPARATORS, [0, 1, -1])
        ]
    return steps


def search(texts: list[str], answers: list[str], family: set[str], limit: int = MAX_SIZE, name: str = "text") -> tuple[int, str] | None:
    """The fewest operations of an expression over the text that gives each board's answer, and
    how it reads. The first of equally short ones in the order the lessons teach the tools."""
    target, start = tuple(answers), tuple(texts)
    if start == target:
        return 0, name
    steps = operations(family)
    seen = {start}
    latest = [(start, name)]  # what the last round found: values on each board, and how it reads
    for size in range(1, limit + 1):
        found = []
        for values, reads in latest:
            for _kind, apply, show in steps:
                try:
                    changed = tuple(apply(value) for value in values)
                except (IndexError, ValueError):
                    continue
                if changed not in seen:
                    seen.add(changed)
                    found.append((changed, show(reads)))
                    if changed == target:
                        return size, found[-1][1]
        latest = found
    return None


def sizes(texts: list[str], answers: list[str]) -> str:
    cells = []
    for name, family in FAMILIES.items():
        found = search(texts, answers, family)
        cells.append(f"{name}: {found[0] if found else 'none'}")
    return "; ".join(cells)


# -- the levels --------------------------------------------------------------------------------
# kind "guards": a rune, and gates that ask for something worked out from it.
# kind "fork": a rune that says which road is safe.
# kind "destination": a rune that says how far to go, in numbers.
# kind "route": a rune that writes the whole route.
# `hints` and `note` are ROT13, with {yvarf} for the line count; `hint3` is how hint 3 is cut from
# the reference: ["key", the first line containing it, an introduction in ROT13] or ["loops", n].

GUARD_MAP = corridor("G", ".", "B", ".", "A", "R", ".", "P")
LOOK = "Urer vf gur yvar gung ernqf gur ehar:"

LEVELS: list[dict] = [
    {
        "id": "ch06-l01",
        "title": "The Runestone",
        "trains": "Reading a rune: read(), a variable holding text, and indexing one character",
        "brief": "A rune is a stone with writing on it. Stand on it, and your pawn can read it.",
        "api": ["move", "read"],
        "kind": "guards",
        "family": "indexing",
        "par": 6,
        "map": GUARD_MAP,
        "questions": {"A": "What does the rune say?", "B": "What is the first letter of the rune?"},
        "boards": [
            {"rune": "ember", "A": "ember", "B": "e"},
            {"rune": "willow", "A": "willow", "B": "w"},
            {"rune": "oracle", "A": "oracle", "B": "o"},
            {"rune": "tin", "A": "tin", "B": "t"},
        ],
        "wrong": ["typed", "plain", "reread"],
        "hints": [
            "Gur ehar vf bayl ernqnoyr juvyr lbhe cnja fgnaqf ba vg. Xrrc jung vg fnlf fbzrjurer fnsr.",
            "Fgber gur grkg va n inevnoyr jura lbh ernq vg. Grkg va n inevnoyr pna or cevagrq yngre, naq n cbfvgvba va fdhner oenpxrgf cvpxf bhg bar punenpgre, pbhagvat sebz 0.",
        ],
        "hint3": ["key", "pawn.read()", LOOK],
        "note": "Ernqvat gur ehar bapr vagb n inevnoyr yrgf obgu thneqf or nafjrerq sebz gur fnzr grkg, rira nsgre gur cnja unf jnyxrq ba. Gur svefg yrggre vf cbfvgvba 0. {yvarf} yvarf.",
        "lesson_board": {"map": "# . #\n# R #\n# P #", "legend": {"R": rune("dawn")}},
    },
    {
        "id": "ch06-l02",
        "title": "Cut It Out",
        "trains": "Slicing text: a stretch of it from the start, the end or the middle",
        "brief": "Every rune here starts with a label. The guards want only part of what it says.",
        "api": ["move", "read"],
        "kind": "guards",
        "family": "indexing and slicing",
        "par": 6,
        "map": GUARD_MAP,
        "questions": {"A": "What is the word after the label?", "B": "What are the last three letters of that word?"},
        "boards": [
            {"rune": "key:amber", "A": "amber", "B": "ber"},
            {"rune": "key:willow", "A": "willow", "B": "low"},
            {"rune": "key:crimson", "A": "crimson", "B": "son"},
            {"rune": "key:lantern", "A": "lantern", "B": "ern"},
        ],
        "wrong": ["typed", "plain", "reread"],
        "hints": [
            "Obgu nafjref ner cnegf bs gur grkg. Ybbx ng jurer rnpu cneg fgnegf naq jurer vg raqf.",
            "N fyvpr gnxrf n fgergpu bs gur grkg: gur ahzore orsber gur pbyba vf jurer vg fgnegf naq gur ahzore nsgre vf jurer vg fgbcf. Yrnir bar bhg gb tb gb gung raq, naq n zvahf pbhagf onpx sebz gur raq.",
        ],
        "hint3": ["key", "pawn.read()", LOOK],
        "note": "N fyvpr jvgu bayl n fgneg tbrf gb gur raq bs gur grkg, fb vg fhvgf jbeqf bs nal yratgu. N zvahf pbhagf onpx sebz gur raq, juvpu vf jul gur ynfg guerr yrggref jbex ba rirel obneq. {yvarf} yvarf.",
        "lesson_board": {"map": "# . #\n# R #\n# P #", "legend": {"R": rune("ward:silver")}},
    },
    {
        "id": "ch06-l03",
        "title": "Smudged Runes",
        "trains": "Methods of text: strip(), upper(), lower() and replace()",
        "brief": "The runes are smudged: stray spaces, wrong capitals, dashes for spaces. The guards want them tidy.",
        "api": ["move", "read"],
        "kind": "guards",
        "family": "methods and slicing",
        "par": 6,
        "map": GUARD_MAP,
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
        "wrong": ["typed", "plain", "reread"],
        "hints": [
            "Gur ehares ner hagvql va qvssrerag jnlf. N grkg pna or pbcvrq naq gvqvrq, naq gur bevtvany vf arire punatrq.",
            "Zrgubqf ner pnyyrq ba grkg jvgu n qbg. Bar erzbirf fcnprf sebz obgu raqf, bar znxrf pncvgnyf, bar znxrf fznyy yrggref, naq bar fjncf bar cvrpr bs grkg sbe nabgure. N zrgubq ergheaf n arj grkg, fb n frpbaq zrgubq pna sbyybj gur svefg.",
        ],
        "hint3": ["key", "pawn.read()", LOOK],
        "note": "Rnpu zrgubq ergheaf n arj grkg, fb gurl punva sebz yrsg gb evtug: rnpu bar jbexf ba gur erfhyg bs gur bar orsber. {yvarf} yvarf.",
        "lesson_board": {"map": "# . #\n# R #\n# P #", "legend": {"R": rune("  Pale-Fire ")}},
    },
    {
        "id": "ch06-l04",
        "title": "Which Road?",
        "trains": "Asking text a question: `in`, startswith() and endswith(), find() and count()",
        "brief": "At the crossroads, two roads end in pits. A rune on the way says which road is safe.",
        "api": ["move", "turn_left", "turn_right", "read"],
        "kind": "fork",
        "par": 8,
        "legend": {"O": "pit"},
        "boards": [
            {"rune": "The old road to the left is the safe one.", "good": "left"},
            {"rune": "Keep to the right, traveller. The other roads end in thorns.", "good": "right"},
            {"rune": "Straight on is the only safe road.", "good": "ahead"},
            {"rune": "Take the left road, friend, and fear nothing.", "good": "left"},
        ],
        "wrong": ["typed", "equal"],
        "hints": [
            "Bayl gur ehar fnlf juvpu ebnq vf fnsr. Ernq vg orsber gur whapgvba, gura pubbfr.",
            "Gb nfx jurgure bar cvrpr bs grkg nccrnef vafvqr nabgure, jevgr gur fznyy grkg, gura va, gura gur ovt grkg. Vg'f Gehr be Snyfr, fb na vs pna hfr vg.",
        ],
        "hint3": ["key", "pawn.read()", LOOK],
        "note": "Gur jbeq gung znggref pna fvg naljurer va gur fragrapr, fb nfxvat jurgure vg nccrnef vf orggre guna nfxvat jurgure gur fragrapr vf bar rknpg grkg. Gur ebnq jvgu ab zngpu vf gur bar yrsg bire. {yvarf} yvarf.",
        "lesson_board": {
            "map": ". . . . .\n. . O . .\n. . . . .\n. . R . .\n. . P . .",
            "legend": {"R": rune("A pit lies ahead."), "O": "pit"},
        },
    },
    {
        "id": "ch06-l05",
        "title": "Where the Rune Points",
        "trains": "Text into numbers: int(), split() and indexing the pieces",
        "brief": "The goal is somewhere out in the open. The rune says how far: first east, then north.",
        "api": ["move", "turn_left", "read"],
        "kind": "destination",
        "par": 5,
        "facing": "east",
        "boards": [
            {"rune": "10,3"},
            {"rune": "4,10"},
            {"rune": "7,2"},
            {"rune": "9,4"},
        ],
        "wrong": ["typed", "text", "digit"],
        "hints": [
            "Gur ehar ubyqf gjb ahzoref, ohg vg'f bar cvrpr bs grkg. Phg vg vagb vgf cnegf svefg.",
            "N grkg pna or phg vagb cvrprf jurerire n frcnengbe nccrnef, naq rnpu cvrpr vf cvpxrq ol vgf cbfvgvba, pbhagvat sebz 0. N cvrpr vf fgvyy grkg, fb ghea vg vagb n ahzore orsber jnyxvat gung sne.",
        ],
        "hint3": ["key", "split", LOOK],
        "note": "Phggvat ng gur pbzzn jbexf jungrire gur yratgu bs rnpu ahzore, juvpu svkrq cbfvgvbaf pna'g. Jnyxvat arrqf n ahzore, abg grkg, fb rnpu cvrpr tbrf guebhtu vag. {yvarf} yvarf.",
        "lesson_board": {"map": ". . . . .\nP R . . .", "legend": {"R": rune("3,12")}, "start": {"facing": "east"}},
    },
    {
        "id": "ch06-l06",
        "title": "The Written Route",
        "trains": "Everything on text: a whole route written on a rune, followed one leg at a time",
        "brief": "A rune writes out the whole route: L or R for the turn, then the number of squares. Follow it to the goal.",
        "api": ["move", "turn_left", "turn_right", "read"],
        "kind": "route",
        "mastery": True,
        "par": 7,
        "boards": [
            {"rune": "R4,L3"},
            {"rune": "L3,R5,L2"},
            {"rune": "R2,L4,R2,L1"},
            {"rune": "R1,L5,R2,L2,R1"},
        ],
        "wrong": ["typed", "unrolled"],
        "hints": [
            "Gur ebhgr vf n yvfg bs yrtf va bar grkg. Qb gur fnzr guvat sbe rnpu yrt, ubjrire znal gurer ner.",
            "Phg gur grkg vagb yrtf, naq yrg n ybbc gnxr gurz bar ng n gvzr. Sbe rnpu yrt, gur svefg punenpgre fnlf juvpu jnl gb ghea naq gur erfg bs vg fnlf ubj sne gb jnyx.",
        ],
        "hint3": ["loops", 1],
        "note": "N ybbc bire gur cvrprf unaqyrf gjb yrtf be svir nyvxr. Rnpu yrt'f svefg punenpgre cvpxf gur ghea, naq gur erfg bs vg, nf n ahzore, vf ubj sne gb jnyx. {yvarf} yvarf.",
        "lesson_board": {"map": ". . . . .\n. . . . .\n. . R . .\n. . P . .", "legend": {"R": rune("R2,L3")}},
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


def drawn(spec: dict) -> dict:
    """The spec as `yaml_text` wants it: the first board as the level's own, the others as variants."""
    boards = boards_for(spec)
    return {
        **spec,
        "facing": spec.get("facing", "north"),
        "map": boards[0][0],
        "legend": boards[0][1],
        "variants": [{"map": text, "legend": legend} for text, legend in boards[1:]],
        "lesson_board": {"start": {"facing": "north"}, **spec["lesson_board"]},
    }


def draft(spec: dict) -> Level:
    """The level as drafted, with par and hints blank, to check its boards parse and read well."""
    return parse_level(yaml.safe_load(yaml_text(drawn(spec), chapter=CHAPTER, api=spec["api"], par=99, hints=["", "", ""])))


# -- the programs ----------------------------------------------------------------------------------

# Fixed lines, in ROT13. Once decoded, {sep} is the separator, {i} an index, {nam} how a leg's number reads.
READ = code("grkg = cnja.ernq()")
SPLIT_BIND = code("cnegf = cnja.ernq().fcyvg({frc})")
PIECE_STEP = code("cnja.zbir(vag(cnegf[{v}]))")
PIECE_TEXT = code("cnja.zbir(cnegf[{v}])")
DIGIT_STEP = code("cnja.zbir(vag(grkg[{v}]))")
LOOP = code("sbe yrt va cnja.ernq().fcyvg({frc}):")
LEG_STEP = code("cnja.zbir(vag({anz}))")
UNROLLED = [code("sbe ahzore va enatr({a}):"), code("yrt = cnegf[ahzore]")]

Made = tuple[list[str], str, dict[str, list[str]]]  # the reference, a few words on its shape, each wrong attempt


def as_code(lines: list[str]) -> str:
    return "\n".join(lines) + "\n"


def bind_options(texts: list[str], family: set[str]) -> list[tuple[str, tuple[int, tuple]]]:
    """How the rune's text may be tidied once, as it's read: not at all, or with one method."""
    options = [("", (0, tuple(texts)))]
    for kind, apply, show in operations(family):
        if kind == "method":
            options.append((show(""), (1, tuple(apply(text) for text in texts))))
    return options


def make_guards(spec: dict) -> Made | None:
    family = FAMILIES[spec["family"]]
    texts = [board["rune"] for board in spec["boards"]]
    gates = list(spec["questions"])
    best = None
    for suffix, (cost, values) in bind_options(texts, family):
        found = {gate: search(list(values), [board[gate] for board in spec["boards"]], family, limit=3) for gate in gates}
        if any(result is None for result in found.values()):
            continue
        score = (cost + sum(size for size, _ in found.values()), len(suffix) + sum(len(reads) for _, reads in found.values()))
        if best is None or score < best[0]:
            best = (score, suffix, {gate: reads for gate, (_, reads) in found.items()})
    if best is None:
        return None
    (total, _), suffix, says = best
    walkway = stops(spec)

    def program(read_line: str | None, say: dict[str, str]) -> list[str]:
        lines = []
        for index, (there, gate) in enumerate(walkway[1:], start=1):
            lines.append(move(there - walkway[index - 1][0]))
            if gate and read_line and index == 1:
                lines.append(read_line)
            if gate:
                lines.append(f"print({say[gate]})")
        return lines

    reading = READ + suffix
    again = f"pawn.read(){suffix}"
    attempts = {
        "typed": as_code(typed_code(spec, spec["boards"][0]).splitlines()).splitlines(),
        "plain": program(reading, dict.fromkeys(gates, "text")),
        "reread": program(None, {gate: reads.replace("text", again) for gate, reads in says.items()}),
    }
    return program(reading, says), f"{total} operations searched", attempts


def make_fork(spec: dict) -> Made | None:
    boards = spec["boards"]
    texts = [board["rune"] for board in boards]
    tests = ['"{w}" in text', 'text.startswith("{w}")', 'text.endswith("{w}")', 'text.find("{w}") != -1', 'text.count("{w}") > 0']
    conds = {}
    for road in ("left", "right"):
        wanted = [board["good"] == road for board in boards]
        works = [t.format(w=road) for t in tests if [eval(t.format(w=road), {}, {"text": text}) for text in texts] == wanted]
        if not works:
            return None
        conds[road] = works[0]
    head = ["pawn.move()", READ, "pawn.move(3)"]
    ladder = [f"if {conds['left']}:", "    pawn.turn_left()", f"elif {conds['right']}:", "    pawn.turn_right()", "pawn.move(4)"]
    literal = [f"if text == {json.dumps(texts[0])}:", "    pawn.turn_left()", f"elif text == {json.dumps(texts[1])}:", "    pawn.turn_right()", "pawn.move(4)"]
    attempts = {"typed": typed_code(spec, boards[0]).splitlines(), "equal": head + literal}
    return head + ladder, "the conditions come from the lesson's tools", attempts


def make_destination(spec: dict) -> Made | None:
    texts = [board["rune"] for board in spec["boards"]]
    sep = next((s for s in SEPARATORS if all(len(t.split(s)) == 2 and all(p.isdigit() for p in t.split(s)) for t in texts)), None)
    if sep is None:
        return None
    bind = SPLIT_BIND.format(sep=json.dumps(sep))
    steps = [PIECE_STEP.format(i=0), "pawn.turn_left()", PIECE_STEP.format(i=1)]
    head = ["pawn.move()", bind]
    attempts = {
        "typed": typed_code(spec, spec["boards"][0]).splitlines(),
        "text": [*head, PIECE_TEXT.format(i=0), steps[1], PIECE_TEXT.format(i=1)],
        "digit": ["pawn.move()", READ, DIGIT_STEP.format(i=0), steps[1], DIGIT_STEP.format(i=-1)],
    }
    return head + steps, "cut at the one separator that works", attempts


def make_route(spec: dict) -> Made | None:
    texts = [board["rune"] for board in spec["boards"]]
    legs = [leg for text in texts for leg in text.split(",")] + ["R10", "L12", "L1", "R7"]  # and some the level doesn't have
    turns = ['leg[0] == "L"', '"L" in leg', 'leg.startswith("L")']
    numbers = ["leg[1]", "leg[-1]", "leg[1:]"]
    turn = next((t for t in turns if all(eval(t, {}, {"leg": leg}) == (leg[0] == "L") for leg in legs)), None)
    number = next((n for n in numbers if all(int(eval(n, {}, {"leg": leg})) == int(leg[1:]) for leg in legs)), None)
    if turn is None or number is None:
        return None
    body = [f"if {turn}:", "    pawn.turn_left()", "else:", "    pawn.turn_right()", LEG_STEP.format(nam=number)]
    loop = [LOOP.format(sep='","'), *(f"    {line}" for line in body)]
    first = len(texts[0].split(","))
    unrolled = [
        "pawn.move()",
        SPLIT_BIND.format(sep='","'),
        UNROLLED[0].format(n=first),
        *(f"    {line}" for line in [UNROLLED[1], *body]),
    ]
    attempts = {"typed": typed_code(spec, spec["boards"][0]).splitlines(), "unrolled": unrolled}
    return ["pawn.move()", *loop], "tested on legs the level doesn't have", attempts


MAKERS = {"guards": make_guards, "fork": make_fork, "destination": make_destination, "route": make_route}


def writer(spec: dict):
    """The `build` writer for one level: its reference and how to write each wrong attempt."""

    def write(_draft: Level):
        made = MAKERS[spec["kind"]](spec)
        if made is None:
            return None
        reference, shape, attempts = made
        return as_code(reference), shape, lambda kind, _level: as_code(attempts[kind])

    return write


def build_one(spec: dict) -> list[str]:
    third = spec["hint3"]
    words = {
        **drawn(spec),
        "hints": [said(hint) for hint in spec["hints"]],
        "note": said(spec["note"]),
        "hint3": [*third[:2], said(third[2])] if len(third) == 3 else third,
    }
    return build(words, CHAPTER, spec["api"], writer(spec))


# -- probe ---------------------------------------------------------------------------------------


def reach(spec: dict) -> str:
    """How far each board's typed attempt gets: how many boards it solves, fewest to most."""
    boards = [case.level for case in draft(spec).cases()]
    solved = []
    for board in spec["boards"]:
        attempt = typed_code(spec, board)
        solved.append([run_level(level, attempt, line_budget=BUDGET, enforce_constraints=False).status == "solved" for level in boards])
    own = all(row[number] for number, row in enumerate(solved))
    return f"each board's own attempt solves its own board: {own}; and {min(map(sum, solved)) - 1} to {max(map(sum, solved)) - 1} others"


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
    print(f"  legs on each board: {[len(text.split(',')) for text in texts]}")
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
    main(LEVELS, build_one, probe)
