// The Codex (docs/Codex.md): the dictionary of the functions the player knows.
//
// Its tab lists every entry. Hovering a function in code (the level's editor,
// lesson snippets, Scratch Python) or a chip in the Challenge panel shows the
// same entry as a tooltip, and help() shows it in Python. Every word comes
// from the engine (codex.py); this file only lays the entries out.
import { syntaxTree } from "@codemirror/language";
import type { EditorState, Extension } from "@codemirror/state";
import { hoverTooltip } from "@codemirror/view";
import type { CodexEntry } from "../py/protocol";
import { h } from "./dom";

/** A level's Codex as hover tooltips see it: the piece's name, and the entries by name ("pawn.move", "print"). */
export interface CodexLookup {
  piece: string;
  entries: ReadonlyMap<string, CodexEntry>;
}

export function codexLookup(piece: string, entries: CodexEntry[]): CodexLookup {
  return { piece, entries: new Map(entries.map((entry) => [entry.name, entry])) };
}

export interface CodexView {
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
  const element = h(
    "div",
    { class: "codex" },
    h("p", { class: "muted small" }, "Everything you've learned so far. Hover a function in your code to see its entry, or ask Python with help()."),
    ...group(`Your ${piece}`, (entry) => entry.kind !== "builtin"),
    ...group("Python", (entry) => entry.kind === "builtin"),
  );
  return {
    element,
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
  const [gist = "", ...more] = entry.summary.split("\n\n");
  return h(
    "details",
    { class: "codex-entry", "data-codex": entry.name, open: entry.new },
    h(
      "summary",
      {},
      callOf(entry),
      entry.new ? h("span", { class: "codex-new" }, "New") : null,
      h("span", { class: "codex-gist" }, ...inline(gist)),
    ),
    h(
      "div",
      { class: "codex-body" },
      ...more.map((paragraph) => h("p", {}, ...inline(paragraph))),
      ...details(entry),
      entry.example ? h("div", { class: "codex-example" }, label("Example"), h("pre", {}, h("code", {}, entry.example))) : null,
      entry.introduced ? h("p", { class: "muted small" }, `Introduced in ${entry.introduced}`) : null,
    ),
  );
}

/** An entry as a tooltip: how to call it, what it does, its arguments and what it returns. */
function codexCard(entry: CodexEntry): HTMLElement {
  return h(
    "div",
    { class: "codex-card" },
    callOf(entry),
    ...entry.summary.split("\n\n").map((paragraph) => h("p", {}, ...inline(paragraph))),
    ...details(entry),
  );
}

/** How to call it. Some built-ins have more than one form ("range(stop) or range(start, stop)"): each is code, "or" isn't. */
function callOf(entry: CodexEntry): HTMLElement {
  const forms = entry.call.split(" or ");
  return h("span", { class: "codex-call" }, ...forms.flatMap((form, index) => [index ? " or " : null, h("code", {}, form)]));
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
        h("dl", {}, ...entry.args.flatMap((arg) => [h("dt", {}, h("code", {}, arg.name)), h("dd", {}, ...inline(arg.about))])),
      ),
    );
  }
  if (entry.returns) parts.push(h("p", { class: "codex-returns" }, label("Returns"), " ", ...inline(entry.returns)));
  return parts;
}

const label = (text: string) => h("span", { class: "codex-label" }, text);

/** Text with `code` in backticks, as nodes (never HTML). */
function inline(text: string): Array<Node | string> {
  return text.split("`").map((part, index) => (index % 2 ? h("code", {}, part) : part));
}

/** The Codex name at `pos`: "pawn.move" on the `move` of pawn.move(), "print" on print. */
export function codexNameAt(state: EditorState, pos: number, side: -1 | 1, piece: string): { name: string; from: number; to: number } | null {
  const node = syntaxTree(state).resolveInner(pos, side);
  const text = (from: number, to: number) => state.sliceDoc(from, to);
  if (node.name === "PropertyName" && node.parent?.name === "MemberExpression") {
    const object = node.parent.firstChild;
    if (object?.name !== "VariableName" || text(object.from, object.to) !== piece) return null;
    return { name: `${piece}.${text(node.from, node.to)}`, from: node.from, to: node.to };
  }
  return node.name === "VariableName" ? { name: text(node.from, node.to), from: node.from, to: node.to } : null;
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

// -- tooltips outside the editor (the Challenge panel's chips) --------------------

const openTips = new Set<() => void>();

/** Show `entry()`'s card beside `target` while it's hovered or focused. */
export function withCodexTooltip(target: HTMLElement, entry: () => CodexEntry | undefined): void {
  let tip: HTMLElement | null = null;
  const hide = () => {
    tip?.remove();
    tip = null;
    target.removeAttribute("aria-describedby");
    openTips.delete(hide);
  };
  const show = () => {
    const found = entry();
    if (tip || !found) return;
    tip = h("div", { class: "codex-tooltip", role: "tooltip", id: "codex-tooltip" }, codexCard(found));
    document.body.append(tip);
    // Fixed to the window, so the scrolling panel can't clip it: below the chip, or above if there's no room.
    const box = target.getBoundingClientRect();
    const width = tip.offsetWidth;
    const height = tip.offsetHeight;
    tip.style.left = `${Math.max(8, Math.min(box.left, window.innerWidth - width - 8))}px`;
    tip.style.top = `${box.bottom + height + 8 > window.innerHeight ? box.top - height - 6 : box.bottom + 6}px`;
    target.setAttribute("aria-describedby", "codex-tooltip");
    openTips.add(hide);
  };
  target.addEventListener("mouseenter", show);
  target.addEventListener("focus", show);
  target.addEventListener("mouseleave", hide);
  target.addEventListener("blur", hide);
  target.addEventListener("click", hide);
  target.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && tip) {
      event.preventDefault(); // this Esc closed the tooltip, so it doesn't open Settings too
      hide();
    }
  });
}

/** Close any open chip tooltip (when the level screen goes away). */
export function closeCodexTooltips(): void {
  for (const hide of [...openTips]) hide();
}
