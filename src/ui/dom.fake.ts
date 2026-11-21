// For tests: vitest runs in Node, so stand in a document that keeps what h() sets: tag, attributes, children and
// listeners. Use it with `vi.stubGlobal("document", fakeDocument)` and read an element back with `asFake`.
export class Fake {
  readonly attributes = new Map<string, string>();
  children: Array<Fake | string> = [];
  /** A form control's value, set by a test before it fires "change". */
  value = "";
  private readonly listeners = new Map<string, () => void>();
  constructor(readonly tag: string) {}
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, listener);
  }
  /** Run the listener h() attached for `type` ("click", "change"). */
  fire(type: string): void {
    this.listeners.get(type)?.();
  }
  append(...nodes: Array<Fake | string>): void {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes: Array<Fake | string>): void {
    this.children = nodes;
  }
  get text(): string {
    return this.children.map((child) => (typeof child === "string" ? child : child.text)).join("");
  }
  private elements(): Fake[] {
    return this.children.filter((child): child is Fake => typeof child !== "string");
  }
  /** This element and every one below it that has the class, in order. */
  find(cls: string): Fake[] {
    const own = this.attributes.get("class")?.split(" ").includes(cls) ? [this] : [];
    return [...own, ...this.elements().flatMap((child) => child.find(cls))];
  }
  /** This element and every one below it with the tag, in order. */
  all(tag: string): Fake[] {
    return [...(this.tag === tag ? [this] : []), ...this.elements().flatMap((child) => child.all(tag))];
  }
}

export const fakeDocument = {
  createElement: (tag: string) => new Fake(tag),
  createElementNS: (_ns: string, tag: string) => new Fake(tag), // svg icons
};

/** An element h() built on the fake document, as the Fake it is. */
export const asFake = (element: HTMLElement): Fake => element as unknown as Fake;
