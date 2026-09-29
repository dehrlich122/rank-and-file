// A tiny helper for building DOM elements without a framework.
//
//   h("button", { class: "btn", onClick: run }, "Run")
//
// Attributes whose name starts with "on" become event listeners. String
// children become text nodes, so player text can never inject HTML.

type Child = Node | string | null | undefined | false;
type AttrValue = string | number | boolean | EventListener | undefined;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, AttrValue> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (typeof value === "function") element.addEventListener(name.slice(2).toLowerCase(), value);
    else element.setAttribute(name, value === true ? "" : String(value));
  }
  for (const child of children) {
    if (child !== null && child !== undefined && child !== false) element.append(child);
  }
  return element;
}

/** Text with `backtick` spans shown as code (hints, Codex entries). Always text nodes, never HTML. */
export function withCode(text: string): Array<string | HTMLElement> {
  return text.split("`").map((part, i) => (i % 2 === 1 ? h("code", {}, part) : part));
}
