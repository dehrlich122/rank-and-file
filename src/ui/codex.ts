// The Codex (docs/Codex.md): the dictionary of the functions the player knows.
//
// Its tab lists every entry. Hovering a function in code (the level's editor,
// lesson snippets, Scratch Python) or a chip in the Challenge panel shows the
// same entry as a tooltip, and help() shows it in Python. Every word comes
// from the engine (codex.py); this file only lays the entries out.
import { syntaxTree } from "@codemirror/language";
import type { EditorState, Extension } from "@codemirror/state";
import { hoverTooltip } from "@codemirror/view";
import { levelLabel } from "../content";
import type { CodexEntry } from "../py/protocol";
import { memberName } from "./completion";
import { h, withCode } from "./dom";

/** A level's Codex as hover tooltips see it: the piece's name, and the entries by name ("pawn.move", "print"). */
export interface CodexLookup {
  piece: string;
  entries: ReadonlyMap<string, CodexEntry>;
}

/** The Codex tab, which is also the lookup its tooltips use. */
export interface CodexView extends CodexLookup {
  element: HTMLElement;
  /** Open an entry and scroll to it (from a chip in the Challenge panel). */
  show(name: string): void;
}

/** The Codex tab: the piece's abilities, then Python's built-ins. Entries new in this level start open. */
export function renderCodex(entries: CodexEntry[], piece: string): CodexView {
  const items = new Map(entries.map((entry) => [entry.name, codexEntry(entry)]));
  const group = (title: string, kind: (entry: CodexEntry) => boolean) => {
    const members = entries.filter(kind);
    return members.length ? [h("h3", {}, title), ...members.map((entry) => items.get(entry.name)!)] : [];
  };
  return {
    piece,
    entries: new Map(entries.map((entry) => [entry.name, entry])),
    element: h(
      "div",
      { class: "codex" },
      h("p", { class: "muted small" }, "Everything you've learned so far. Hover a function in your code to see its entry, or ask Python with help()."),
      ...group(`Your ${piece}`, (entry) => entry.kind !== "builtin"),
      ...group("Python", (entry) => entry.kind === "builtin"),
    ),
    show(name) {
      const item = items.get(name);
      if (!item) return;
      item.open = true;
      item.scrollIntoView({ block: "nearest" });
      item.querySelector("summary")?.focus();
    },
  };
}

function codexEntry(entry: CodexEntry): HTMLDetailsElement {
  const [gist = "", ...more] = entry.paragraphs;
  return h(
    "details",
    { class: "codex-entry", "data-codex": entry.name, open: entry.new },
    h(
      "summary",
      {},
      callsOf(entry),
      entry.new ? h("span", { class: "codex-new" }, "New") : null,
      h("span", { class: "codex-gist" }, ...withCode(gist)),
    ),
    h(
      "div",
      { class: "codex-body" },
      ...more.map((paragraph) => h("p", {}, ...withCode(paragraph))),
      ...details(entry),
      entry.example ? h("div", { class: "codex-example" }, label("Example"), h("pre", {}, h("code", {}, entry.example))) : null,
      h("p", { class: "muted small" }, `Introduced in ${levelLabel(entry.introduced)}`),
    ),
  );
}

/** An entry as a tooltip: how to call it, what it does, its arguments and what it returns. */
function codexCard(entry: CodexEntry): HTMLElement {
  return h("div", { class: "codex-card" }, callsOf(entry), ...entry.paragraphs.map((paragraph) => h("p", {}, ...withCode(paragraph))), ...details(entry));
}

/** How to call it. Some built-ins have more than one form: each is code, joined by a plain "or". */
function callsOf(entry: CodexEntry): HTMLElement {
  return h("span", { class: "codex-call" }, ...entry.calls.flatMap((call, index) => [index ? " or " : null, h("code", {}, call)]));
}

/** The arguments and what it returns, shared by the tab and the tooltips. */
function details(entry: CodexEntry): HTMLElement[] {
  const parts: HTMLElement[] = [];
  if (entry.args.length) {
    parts.push(
      h(
        "div",
        { class: "codex-args" },
        label(entry.args.length === 1 ? "Argument" : "Arguments"),
        h("dl", {}, ...entry.args.flatMap((arg) => [h("dt", {}, h("code", {}, arg.name)), h("dd", {}, ...withCode(arg.about))])),
      ),
    );
  }
  if (entry.returns) parts.push(h("p", { class: "codex-returns" }, label("Returns"), " ", ...withCode(entry.returns)));
  return parts;
}

const label = (text: string) => h("span", { class: "codex-label" }, text);

/** The Codex name at `pos`: "pawn.move" on the `move` of pawn.move(), "print" on print. */
export function codexNameAt(state: EditorState, pos: number, side: -1 | 1, piece: string): { name: string; from: number; to: number } | null {
  const node = syntaxTree(state).resolveInner(pos, side);
  if (node.name === "PropertyName" && node.parent) {
    const name = memberName(state, node.parent);
    return name?.startsWith(`${piece}.`) ? { name, from: node.from, to: node.to } : null;
  }
  return node.name === "VariableName" ? { name: state.sliceDoc(node.from, node.to), from: node.from, to: node.to } : null;
}

/** Hovering a function in code shows its Codex entry. `current` is null until the level's Codex has loaded. */
export function codexHover(current: () => CodexLookup | null): Extension {
  return hoverTooltip(
    (view, pos, side) => {
      const codex = current();
      const found = codex && codexNameAt(view.state, pos, side, codex.piece);
      const entry = found && codex.entries.get(found.name);
      if (!found || !entry) return null;
      return { pos: found.from, end: found.to, above: true, create: () => ({ dom: codexCard(entry) }) };
    },
    { hoverTime: 350 },
  );
}

/**
 * The tooltip for the Challenge panel's chips. There's one per level screen,
 * inside it, so it goes when the screen does. It's a popover, so the scrolling
 * panel can't clip it.
 */
export class ChipTooltip {
  private readonly element = h("div", { class: "codex-tooltip", role: "tooltip", id: "codex-tooltip", popover: "manual" });
  private shownFor: HTMLElement | null = null;

  constructor(host: HTMLElement) {
    host.append(this.element);
  }

  /** Show `entry()`'s card beside `target` while it's hovered or focused. */
  attach(target: HTMLElement, entry: () => CodexEntry | undefined): void {
    const show = () => this.show(target, entry());
    const hide = () => this.hide(target);
    target.addEventListener("mouseenter", show);
    target.addEventListener("focus", show);
    target.addEventListener("mouseleave", hide);
    target.addEventListener("blur", hide);
    target.addEventListener("click", hide);
    target.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.shownFor === target) {
        event.preventDefault(); // this Esc closed the tooltip, so it doesn't open Settings too
        hide();
      }
    });
  }

  private show(target: HTMLElement, entry: CodexEntry | undefined): void {
    if (!entry) return;
    if (this.shownFor) this.hide(this.shownFor);
    this.element.replaceChildren(codexCard(entry));
    this.element.showPopover();
    // Below the chip, or above it if there's no room.
    const box = target.getBoundingClientRect();
    const { offsetWidth: width, offsetHeight: height } = this.element;
    this.element.style.left = `${Math.max(8, Math.min(box.left, window.innerWidth - width - 8))}px`;
    this.element.style.top = `${box.bottom + height + 8 > window.innerHeight ? box.top - height - 6 : box.bottom + 6}px`;
    target.setAttribute("aria-describedby", this.element.id);
    this.shownFor = target;
  }

  private hide(target: HTMLElement): void {
    if (this.shownFor !== target) return;
    this.element.hidePopover();
    target.removeAttribute("aria-describedby");
    this.shownFor = null;
  }
}
