// The key and the door (M5.3-6), drawn as the designer picked them from the design sheet: take K3 for the key (its name
// along the stone's edge, set the way the board sets its coordinates, with a rule under the key) and D2 for the door (a
// square slab with a key slot, the name in a capsule on its lintel; open, the slab swings and the capsule stays).
// All the art is in a 64-unit square centred on (0, 0). A name is text ("brass") or a whole number (12).
// Which look a key or door has never depends on a rule: the board marks the tile `collected` or `open` from the state.
import type { LevelInfo, Pos } from "../py/protocol";
import { svg } from "./svg";
import { sprite, tooltip } from "./tileParts";

type Name = string | number;

/** A name written to fit a width: one or two digits get bigger letters than five. */
export function nameText(name: Name, x: number, y: number, width: number, extra = "", anchor = "middle", cap = 19): SVGElement {
  const text = String(name);
  const size = Math.min(cap, Math.floor(width / (text.length * 0.62)));
  return svg("text", { class: `name ${extra}`, x, y, "text-anchor": anchor, "dominant-baseline": "central", style: `font-size:${size}px` }, text);
}

export const line = (cls: string, d: string) => svg("path", { class: cls, d });
export const rect = (cls: string, x: number, y: number, w: number, hh: number, r = 0) => svg("rect", { class: cls, x, y, width: w, height: hh, rx: r });

/** A key's shaft and teeth, hanging from (x, top) down to (x, bottom) or running right along y. */
export const shaftDown = (x: number, top: number, bottom: number) => `M ${x} ${top} V ${bottom} M ${x} ${bottom - 11} H ${x + 9} M ${x} ${bottom - 3} H ${x + 6}`;
export const shaftAcross = (left: number, y: number, right: number) => `M ${left} ${y} H ${right} M ${right - 11} ${y} V ${y + 8} M ${right - 3} ${y} V ${y + 6}`;

/** K3: the key with its name along the stone's edge. */
export function keyArt(name: Name): SVGElement {
  return svg("g", { class: "key-art" }, svg("circle", { class: "k-line", cx: -14, cy: -8, r: 9 }), line("k-line", shaftAcross(-5, -8, 24)), line("edge-rule", "M -29 14 H 29"), nameText(name, -27, 23, 46, "edge-name", "start", 15));
}

/** D2: the door, locked or open. */
export function doorArt(name: Name, open: boolean): SVGElement {
  const art = svg("g", { class: open ? "door-art door-open" : "door-art door-locked" });
  art.append(rect(open ? "d-line d-void" : "d-line d-slab", -17, -8, 34, 34));
  if (open) art.append(line("d-line d-slab", "M -17 -8 V 26 L -7 22 V -4 Z"));
  else art.append(rect("k-line", -2.5, -1, 5, 17), line("k-line", "M 2.5 11 H 7"));
  art.append(rect("k-line bow", -26, -29, 52, 19, 9.5), nameText(name, 0, -19.5, 44));
  return art;
}

/** The squares of the doors that stand open: the engine lists the names of the keys carried, and a door is open while its key is among them. */
export const openDoors = (doors: LevelInfo["doors"] = [], inventory: Name[] = []): Pos[] => doors.filter((door) => inventory.includes(door.key)).map((door) => door.pos);

/** A key's name as the tooltips say it: "the brass key", "key 12". */
export const keyWords =(name: Name) => (typeof name === "number" ? `key ${name}` : `the ${name} key`);

/** A key on the board. The `collected` class (styles.css) takes it away once the piece has picked it up. */
export function keyTile(left: number, top: number, name: Name): SVGGElement {
  const words = typeof name === "number" ? `Key ${name}` : `The ${name} key`;
  return svg("g", { class: "key" }, tooltip(`${words}. Stand on its stone and call pick_up().`), sprite(left, top, keyArt(name)));
}

/** A door on the board: both drawings are in it, and the `open` class (styles.css) swings from one to the other. */
export function doorTile(left: number, top: number, name: Name): SVGGElement {
  const both = svg("g", {}, svg("g", { class: "spr-closed" }, doorArt(name, false)), svg("g", { class: "spr-open" }, doorArt(name, true)));
  return svg("g", { class: "door" }, tooltip(`A locked door. It opens for a knight carrying ${keyWords(name)}.`), sprite(left, top, both));
}
