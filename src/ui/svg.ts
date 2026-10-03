// The one way the board and the sprites build SVG: a namespaced element with attributes and children.
const NS = "http://www.w3.org/2000/svg";

export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, ...children: Array<Element | string>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  for (const child of children) node.append(child);
  return node;
}
