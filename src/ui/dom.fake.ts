// For tests: vitest runs in Node, so stand in a document that keeps what h() sets: tag, attributes and children.
export class Fake {
  readonly attributes = new Map<string, string>();
  readonly children: Array<Fake | string> = [];
  constructor(readonly tag: string) {}
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  addEventListener(): void {}
  append(...nodes: Array<Fake | string>): void {
    this.children.push(...nodes);
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
  buttons(): Fake[] {
    return [...(this.tag === "button" ? [this] : []), ...this.elements().flatMap((child) => child.buttons())];
  }
}

export const fakeDocument = { createElement: (tag: string) => new Fake(tag) };
