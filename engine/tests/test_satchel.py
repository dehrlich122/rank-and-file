"""M5.3's contract (keys, doors and the satchel): the two tiles as the level file writes them, and what stays true of
every other level. The behaviour (picking up, landing on a door) is later packages'."""

import pytest

from conftest import make_level
from rankfile.board import Tile
from rankfile.exceptions import BlockedError, DoorLockedError, GameError, PickUpError
from rankfile.levels import LevelError, editor_options
from rankfile.pieces import Knight, Piece
from rankfile.repl import NoBoard
from rankfile.runner import run_level
from rankfile.world import World

KNIGHT_API = list(Knight.ABILITIES)
VAULT = """
. . . . .
. K . D G
. . P . .
"""


def vault(name="brass", wants="brass", **overrides):
    legend = {"K": {"tile": "key", "name": name}, "D": {"tile": "door", "key": wants}}
    return make_level(VAULT, piece="knight", api=KNIGHT_API, legend=legend, **overrides)


@pytest.mark.parametrize("name", ["brass", 7])
def test_keys_and_doors_parse_from_a_legend(name):
    level = vault(name, name)
    assert level.board.tile((1, 1)) is Tile.KEY and level.board.tile((3, 1)) is Tile.DOOR
    assert level.board.keys == {(1, 1): name}
    assert level.board.doors == {(3, 1): name}


@pytest.mark.parametrize("name", ["brass", 7])
def test_a_level_with_keys_and_doors_describes_them(name):
    info = vault(name, name).describe()
    assert info["keys"] == [{"pos": [1, 1], "name": name}]
    assert info["doors"] == [{"pos": [3, 1], "key": name}]
    assert info["tiles"][1][1] == "key" and info["tiles"][1][3] == "door"


def test_a_level_with_only_keys_describes_no_doors():
    level = make_level(VAULT.replace("D", "."), piece="knight", api=KNIGHT_API, legend={"K": {"tile": "key", "name": "brass"}})
    info = level.describe()
    assert info["keys"] == [{"pos": [1, 1], "name": "brass"}]
    assert "doors" not in info


def test_every_other_level_describes_itself_as_before():
    info = make_level(". . .\nP . G").describe()
    assert "keys" not in info and "doors" not in info
    assert "inventory" not in info["start"]


def test_a_door_whose_key_is_on_no_board_is_refused():
    with pytest.raises(LevelError, match="wants the key 'copper'") as refused:
        vault("brass", "copper")
    assert refused.value.at == {"square": "d2"}


def test_a_key_on_another_board_of_the_level_will_do():
    other = {"map": ". . . . .\n. K . . G\n. . P . .", "legend": {"K": {"tile": "key", "name": "copper"}}}
    level = vault("brass", "copper", variants=[other])
    assert level.variants[0].board.keys == {(1, 1): "copper"}


def test_text_and_number_names_cannot_mix_in_one_level():
    with pytest.raises(LevelError, match="text or with whole numbers, not both"):
        vault("brass", 7)
    other = {"map": ". . . . .\n. K . . G\n. . P . .", "legend": {"K": {"tile": "key", "name": 7}}}
    with pytest.raises(LevelError, match="text or with whole numbers, not both"):
        vault("brass", "brass", variants=[other])


@pytest.mark.parametrize("bad", [True, 1.5, "", None, ["a"]])
def test_a_name_is_text_or_a_whole_number(bad):
    with pytest.raises(LevelError, match="needs name: text or a whole number"):
        vault(bad, "brass")


def test_a_key_tile_takes_a_name_and_a_door_takes_a_key():
    with pytest.raises(LevelError, match="a key doesn't take key"):
        make_level(VAULT, legend={"K": {"tile": "key", "key": "brass"}, "D": {"tile": "key", "name": "x"}})
    with pytest.raises(LevelError, match="a door needs key"):
        make_level(VAULT, legend={"K": {"tile": "key", "name": "x"}, "D": {"tile": "door"}})


def test_the_satchel_starts_empty_and_is_copied():
    world = World(vault())
    assert world.inventory == [] and world.satchel
    twin = world.copy()
    twin.inventory.append("brass")
    assert world.inventory == []
    assert world.state()["inventory"] == [] and twin.state()["inventory"] == ["brass"]


def test_no_inventory_in_the_state_without_keys_or_doors():
    world = World(make_level(". . .\nP . G"))
    assert not world.satchel
    assert "inventory" not in world.state()


def test_the_world_has_no_pick_up_yet():
    with pytest.raises(NotImplementedError, match="M5.3-2"):
        World(vault()).pick_up()


def test_the_two_errors_are_the_games():
    assert issubclass(PickUpError, GameError)
    assert issubclass(DoorLockedError, BlockedError)
    assert DoorLockedError("shut", at=(3, 1)).at == (3, 1)


@pytest.mark.parametrize("name", ["pick_up", "inventory"])
def test_the_unbuilt_abilities_are_not_there_for_a_player(name):
    assert Knight.UNBUILT == ("pick_up", "inventory") and Piece.UNBUILT == ()
    assert name not in Knight.ABILITIES
    knight = Knight(NoBoard("knight"), KNIGHT_API)
    with pytest.raises(AttributeError) as raised:
        getattr(knight, name)
    assert not isinstance(raised.value, GameError)  # Python's own error, as for any made-up name
    assert not hasattr(knight, name)
    assert name not in dir(knight)


@pytest.mark.parametrize("name", ["pick_up", "inventory"])
def test_typing_an_unbuilt_name_reads_as_it_always_did(name):
    level = vault()
    unbuilt = run_level(level, f"knight.{name}")
    made_up = run_level(level, "knight.fetch")
    assert unbuilt.error.type == "AttributeError"
    assert unbuilt.error.friendly == made_up.error.friendly.replace("fetch", name)
    assert "doesn't have an ability called" in unbuilt.error.friendly


def test_the_bridge_and_the_piece_methods_still_exist_for_the_next_package():
    assert callable(Knight.pick_up) and isinstance(Knight.inventory, property)


def test_neither_tile_is_a_special_case_for_the_editors_options():
    options = editor_options()["tiles"]
    assert options["key"] == {"needs": ["name"], "may": []}
    assert options["door"] == {"needs": ["key"], "may": []}
