// The satchel (M5.3-7), drawn as the designer picked it from the design sheet: take S2, a column beside the board with a
// head ("Satchel", "n of 8") and eight slots one under another, a key glyph and its name on each filled row.
// It only draws `state.inventory`, the engine's list of the names of the keys carried, in the order they were picked up.
import { h } from "./dom";
import { line } from "./keyDoor";
import { svg } from "./svg";

type Key = string | number;

const CAPACITY = 8;

/** A small key for the satchel: the same bow and shaft whatever the name, which is written beside it. */
const keyGlyph = () => svg("svg", { class: "satchel-glyph", viewBox: "0 0 34 20", "aria-hidden": "true" }, svg("circle", { class: "k-line", cx: 8, cy: 10, r: 6 }), line("k-line", "M 14 10 H 31 M 25 10 V 16 M 30 10 V 14"));

interface Options {
  slots?: boolean; // the empty slots, up to the capacity (default: yes)
  extra?: (index: number) => HTMLElement[]; // more on a key's row (the design sheet's index)
  cls?: string; // more on the list, for a look of the design sheet
}

/** The head and the list of a satchel holding `keys`. Past the capacity every key still shows, no slot is left, and the count is just "n". */
export function satchelContents(keys: readonly Key[], { slots = true, extra, cls = "" }: Options = {}): HTMLElement[] {
  const rows = keys.map((name, i) => h("li", { class: "satchel-chip" }, keyGlyph(), h("span", { class: "satchel-chip-name" }, String(name)), ...(extra?.(i) ?? [])));
  const empty = slots ? Array.from({ length: Math.max(0, CAPACITY - keys.length) }, () => h("li", { class: "satchel-slot", "aria-hidden": "true" })) : [];
  const count = keys.length > CAPACITY ? `${keys.length}` : `${keys.length} of ${CAPACITY}`;
  return [h("p", { class: "satchel-head" }, "Satchel", h("span", {}, count)), h("ul", { class: `satchel ${cls}`.trim(), "aria-label": "The satchel" }, ...rows, ...empty)];
}

/** The satchel on a level screen: `show()` replaces what it holds with the keys of a state. */
export class SatchelView {
  readonly element = h("div", { class: "satchel-box" });

  constructor() {
    this.show([]);
  }

  show(keys: readonly Key[]): void {
    this.element.replaceChildren(...satchelContents(keys));
  }
}
