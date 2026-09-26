// Tiered hints (M2): a nudge, then a concept reminder, then a partial example.
//
// They sit in the Challenge panel and open one at a time, only when asked.
// Opened hints stay open. Opening the first gives up the level's no-hints
// star, and the panel says so before that happens.
import { h } from "./dom";

export class HintsPanel {
  readonly element = h("section", { class: "hints", "aria-live": "polite" });

  constructor(
    private readonly hints: string[],
    private opened: number,
    private readonly onOpen: (opened: number) => void,
  ) {
    this.opened = Math.min(opened, hints.length);
    this.render();
  }

  get allOpen(): boolean {
    return this.opened >= this.hints.length;
  }

  private openNext(): void {
    if (this.allOpen) return;
    this.opened += 1;
    this.onOpen(this.opened);
    this.render();
    this.element.querySelector<HTMLElement>(".hint-list li:last-child")?.focus();
  }

  private render(): void {
    const total = this.hints.length;
    if (total === 0) {
      this.element.replaceChildren();
      return;
    }
    const parts: HTMLElement[] = [h("h3", {}, "Hints")];
    if (this.opened > 0) {
      parts.push(
        h("ol", { class: "hint-list" }, ...this.hints.slice(0, this.opened).map((hint) => h("li", { tabindex: -1 }, ...withCode(hint)))),
      );
    }
    if (!this.allOpen) {
      const label = this.opened === 0 ? `Show a hint (1 of ${total})` : `Show the next hint (${this.opened + 1} of ${total})`;
      parts.push(h("button", { class: "btn btn-small hint-button", onClick: () => this.openNext() }, label));
    }
    if (this.opened === 0) {
      parts.push(h("p", { class: "muted small" }, "Opening a hint gives up this level's no-hints star. Hints stay open once you've seen them."));
    }
    this.element.replaceChildren(...parts);
  }
}

/** Text with `backtick` spans shown as code. Always text nodes, never HTML. */
function withCode(text: string): Array<string | HTMLElement> {
  return text.split("`").map((part, i) => (i % 2 === 1 ? h("code", {}, part) : part));
}
