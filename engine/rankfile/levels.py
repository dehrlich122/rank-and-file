"""Level files: reading them, checking them, and describing them to the UI.

Levels are written in YAML (the format is documented in docs/ARCHITECTURE.md).
By the time a level reaches this module it's a plain dict: PyYAML parses it in
the tests, the UI's YAML parser in the browser. `parse_level` checks it
thoroughly, because a typo in a level file should fail loudly in the level
checker instead of confusing a player.
"""

import ast
from dataclasses import asdict, dataclass, field

from .board import Board, Direction, Pos, Tile, square_name
from .constraints import describe_rules
from .pieces import PIECES


class LevelError(ValueError):
    """A level file is malformed."""


# Map symbols every level understands. A level's `legend` can add more.
START, GOAL = "P", "G"
BUILTIN_SYMBOLS = {".": Tile.FLOOR, "#": Tile.WALL, START: Tile.FLOOR, GOAL: Tile.FLOOR}
# Legend tiles that need one extra detail, e.g. `S: {tile: sign, text: "..."}`.
TILE_DETAILS = {Tile.SIGN: "text", Tile.GATE: "passphrase"}

ALLOWED_KEYS = {
    "id", "chapter", "title", "trains", "brief", "piece", "map", "legend", "start",
    "objectives", "api", "constraints", "par", "hints", "lesson", "starter",
}  # fmt: skip
REQUIRED_KEYS = {"id", "chapter", "title", "trains", "map", "api", "lesson"}


@dataclass
class Constraints:
    max_lines: int | None = None  # lines of code, not counting blanks and comments
    min_comments: int = 0
    require_nodes: list[str] = field(default_factory=list)  # ast node names, e.g. "For"
    ban_nodes: list[str] = field(default_factory=list)


@dataclass
class Par:
    """The target a skilled solution meets; meeting it earns a star (M2)."""

    lines: int | None = None  # lines of code, counted like max_lines


@dataclass
class Objectives:
    reach_goal: bool = True
    say: list[str] = field(default_factory=list)  # phrases the program must print


@dataclass
class Level:
    id: str
    chapter: int
    title: str
    trains: str
    piece: str
    board: Board
    start: Pos
    facing: Direction
    goal: Pos | None
    objectives: Objectives
    api: list[str]
    constraints: Constraints
    par: Par = field(default_factory=Par)
    hints: list[str] = field(default_factory=list)
    lesson: str = ""
    brief: str = ""
    starter: str = ""

    def goals(self) -> list[str]:
        """What the player has to do, one sentence each. Never gives away a passphrase."""
        goals = []
        if self.objectives.reach_goal and self.goal:
            goals.append(f"Reach the goal on {square_name(self.goal)}.")
        for phrase in self.objectives.say:
            if any(phrase in text for text in self.board.signs.values()):
                goals.append("Say the phrase from the signpost: print it, exactly as written.")
            else:
                goals.append(f'Say "{phrase}" (print it).')
        for gate in sorted(self.board.gates):
            goals.append(f"Get past the locked gate on {square_name(gate)}. A guard keeps it shut.")
        return goals

    def star_goals(self) -> list[str]:
        """What each of the three stars asks for (runner.score awards them)."""
        par = self.par.lines
        within = f"Use {par} line{'' if par == 1 else 's'} of code or fewer (par)." if par else "There's no par here: solving is enough."
        return ["Solve the level.", within, "Solve it without opening a hint."]

    def describe(self) -> dict:
        """Everything the UI needs to draw the level, as JSON-friendly data."""
        return {
            "id": self.id,
            "chapter": self.chapter,
            "title": self.title,
            "trains": self.trains,
            "brief": self.brief,
            "piece": self.piece,
            "width": self.board.width,
            "height": self.board.height,
            # tiles[y][x], with y = 0 being the bottom rank
            "tiles": [
                [self.board.tile((x, y)).value for x in range(self.board.width)]
                for y in range(self.board.height)
            ],
            "signs": [{"pos": list(pos), "text": text} for pos, text in self.board.signs.items()],
            "goal": list(self.goal) if self.goal else None,
            # Gates appear in `tiles`; their passphrases are deliberately left out.
            "start": {"pos": list(self.start), "facing": self.facing.value, "opened": []},
            "objectives": asdict(self.objectives),
            "api": self.api,
            "constraints": asdict(self.constraints),
            "par": asdict(self.par),
            "starter": self.starter,
            # What the Challenge panel shows, in words: the engine owns every
            # player-facing description of its rules.
            "goals": self.goals(),
            "rules": describe_rules(self.constraints),
            "stars": self.star_goals(),
        }


def parse_level(data: dict) -> Level:
    if not isinstance(data, dict):
        raise LevelError("a level must be a mapping of keys to values")
    unknown = set(data) - ALLOWED_KEYS
    if unknown:
        raise LevelError(f"unknown key(s): {', '.join(sorted(unknown))}")
    missing = REQUIRED_KEYS - set(data)
    if missing:
        raise LevelError(f"missing key(s): {', '.join(sorted(missing))}")

    piece = data.get("piece", "pawn")
    if piece not in PIECES:
        raise LevelError(f"unknown piece {piece!r}; expected one of {sorted(PIECES)}")

    board, start, goal = parse_map(data["map"], data.get("legend") or {})
    facing = _parse_facing((data.get("start") or {}).get("facing", "north"))
    objectives = _parse_objectives(data.get("objectives", ["reach_goal"]))
    if objectives.reach_goal and goal is None:
        raise LevelError("objective reach_goal needs a goal square (G) on the map")

    return Level(
        id=_text(data, "id"),
        chapter=_int(data, "chapter"),
        title=_text(data, "title"),
        trains=_text(data, "trains"),
        piece=piece,
        board=board,
        start=start,
        facing=facing,
        goal=goal,
        objectives=objectives,
        api=_parse_api(data["api"], piece),
        constraints=_parse_constraints(data.get("constraints") or {}),
        par=_parse_par(data.get("par") or {}),
        hints=[str(hint) for hint in data.get("hints") or []],
        lesson=_text(data, "lesson"),
        brief=str(data.get("brief", "")),
        starter=str(data.get("starter", "")),
    )


def parse_map(text: str, legend: dict) -> tuple[Board, Pos, Pos | None]:
    """Read an ASCII map. The first line is the top rank; symbols are separated by spaces."""
    if not isinstance(text, str) or not text.strip():
        raise LevelError("map must be a non-empty block of text")
    rows = [line.split() for line in text.strip("\n").splitlines() if line.strip()]
    width, height = len(rows[0]), len(rows)
    if any(len(row) != width for row in rows):
        raise LevelError("every map row must have the same number of squares")

    symbols = dict(BUILTIN_SYMBOLS)
    details: dict[str, str] = {}  # symbol -> its sign text or gate passphrase
    for symbol, meaning in legend.items():
        symbol = str(symbol)
        if symbol in BUILTIN_SYMBOLS:
            raise LevelError(f"legend can't redefine the built-in symbol {symbol!r}")
        meaning = meaning if isinstance(meaning, dict) else {"tile": meaning}
        try:
            tile = symbols[symbol] = Tile(meaning.get("tile"))
        except ValueError:
            raise LevelError(f"legend {symbol!r}: unknown tile {meaning.get('tile')!r}") from None
        needs = TILE_DETAILS.get(tile)
        unknown = set(meaning) - {"tile"} - ({needs} if needs else set())
        if unknown:
            raise LevelError(f"legend {symbol!r}: a {tile.value} doesn't take {', '.join(sorted(unknown))}")
        if needs:
            if not isinstance(meaning.get(needs), str) or not meaning[needs]:
                raise LevelError(f"legend {symbol!r}: a {tile.value} needs {needs}")
            details[symbol] = meaning[needs]

    board = Board(width, height)
    start: Pos | None = None
    goal: Pos | None = None
    for row_index, row in enumerate(rows):
        y = height - 1 - row_index
        for x, symbol in enumerate(row):
            if symbol not in symbols:
                raise LevelError(f"map symbol {symbol!r} at row {row_index + 1} isn't built in or in the legend")
            tile = symbols[symbol]
            if tile is not Tile.FLOOR:
                board.tiles[(x, y)] = tile
            if tile is Tile.SIGN:
                board.signs[(x, y)] = details[symbol]
            if tile is Tile.GATE:
                board.gates[(x, y)] = details[symbol]
            if symbol == START:
                if start is not None:
                    raise LevelError("the map has more than one start square (P)")
                start = (x, y)
            if symbol == GOAL:
                if goal is not None:
                    raise LevelError("the map has more than one goal square (G)")
                goal = (x, y)
    if start is None:
        raise LevelError("the map needs a start square (P)")
    return board, start, goal


def sandbox_level(api: list[str], piece: str = "pawn") -> Level:
    """A small open board for trying things out in lesson snippets."""
    board = Board(width=5, height=4)
    return Level(
        id="sandbox",
        chapter=0,
        title="Sandbox",
        trains="",
        piece=piece,
        board=board,
        start=(2, 0),
        facing=Direction.NORTH,
        goal=None,
        objectives=Objectives(reach_goal=False),
        api=list(api),
        constraints=Constraints(),
    )


def _text(data: dict, key: str) -> str:
    value = data.get(key)
    if not isinstance(value, str) or not value.strip():
        raise LevelError(f"{key} must be non-empty text")
    return value


def _int(data: dict, key: str) -> int:
    value = data.get(key)
    if not isinstance(value, int) or isinstance(value, bool):
        raise LevelError(f"{key} must be a whole number")
    return value


def _parse_facing(value) -> Direction:
    try:
        return Direction(value)
    except ValueError:
        raise LevelError(f"start facing must be north, east, south or west, not {value!r}") from None


def _parse_objectives(items) -> Objectives:
    if not isinstance(items, list) or not items:
        raise LevelError("objectives must be a non-empty list")
    objectives = Objectives(reach_goal=False)
    for item in items:
        if item == "reach_goal":
            objectives.reach_goal = True
        elif isinstance(item, dict) and set(item) == {"say"} and isinstance(item["say"], str):
            objectives.say.append(item["say"])
        else:
            raise LevelError(f"unknown objective {item!r}")
    return objectives


def _parse_api(names, piece: str) -> list[str]:
    if not isinstance(names, list):
        raise LevelError("api must be a list of ability names")
    known = PIECES[piece].ABILITIES
    for name in names:
        if name not in known:
            raise LevelError(f"api: the {piece} has no ability {name!r}; it has {', '.join(known)}")
    return list(names)


def _parse_par(data: dict) -> Par:
    if not isinstance(data, dict):
        raise LevelError("par must be a mapping, e.g. {lines: 3}")
    unknown = set(data) - {"lines"}
    if unknown:
        raise LevelError(f"unknown par key(s): {', '.join(sorted(unknown))}")
    lines = data.get("lines")
    if lines is not None and (not isinstance(lines, int) or isinstance(lines, bool) or lines < 1):
        raise LevelError("par lines must be a whole number of at least 1")
    return Par(lines=lines)


def _parse_constraints(data: dict) -> Constraints:
    allowed = {"max_lines", "min_comments", "require_nodes", "ban_nodes"}
    unknown = set(data) - allowed
    if unknown:
        raise LevelError(f"unknown constraint(s): {', '.join(sorted(unknown))}")
    constraints = Constraints(**data)
    for name in constraints.require_nodes + constraints.ban_nodes:
        node_type = getattr(ast, name, None)
        if not (isinstance(node_type, type) and issubclass(node_type, ast.AST)):
            raise LevelError(f"constraint node {name!r} isn't an ast node type")
    return constraints
