// The scratch REPL: type Python, see the answer, like the `python` prompt.
// The session lives in the worker, so variables survive between lines.
import { PythonHungError, type PyClient } from "../py/client";
import { h } from "./dom";
import { errorCard } from "./panels";

export class ReplPanel {
  readonly element: HTMLElement;
  private readonly log = h("div", { class: "repl-log", "aria-live": "polite" });
  private readonly prompt = h("span", { class: "repl-prompt" }, ">>>");
  private readonly input = h("input", {
    class: "repl-input",
    type: "text",
    spellcheck: "false",
    autocomplete: "off",
    "aria-label": "Python input",
  });
  private readonly history: string[] = [];
  private historyIndex = 0;
  private busy = false;

  constructor(private readonly client: PyClient) {
    this.element = h(
      "div",
      { class: "repl" },
      h(
        "p",
        { class: "muted small" },
        "Try any Python here. Press Enter to run a line; a line ending in : starts a block, and an empty line finishes it.",
      ),
      this.log,
      h("label", { class: "repl-line" }, this.prompt, this.input),
      h("div", { class: "repl-actions" }, h("button", { class: "btn btn-small", onClick: () => void this.reset() }, "Reset session")),
    );
    this.input.addEventListener("keydown", (event) => this.onKey(event));
    this.log.addEventListener("click", () => this.input.focus());
  }

  private onKey(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      void this.submit(this.input.value);
    } else if (event.key === "ArrowUp" && this.historyIndex > 0) {
      event.preventDefault();
      this.input.value = this.history[--this.historyIndex] ?? "";
    } else if (event.key === "ArrowDown" && this.historyIndex < this.history.length) {
      event.preventDefault();
      this.input.value = this.history[++this.historyIndex] ?? "";
    }
  }

  private async submit(line: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.input.value = "";
    if (line.trim()) this.history.push(line);
    this.historyIndex = this.history.length;
    this.write("repl-echo", `${this.prompt.textContent} ${line}`);
    try {
      const result = await this.client.call("replPush", { line });
      if (result.output) this.write("repl-out", result.output.replace(/\n$/, ""));
      if (result.error) this.log.append(errorCard(result.error));
      this.prompt.textContent = result.more ? "..." : ">>>";
    } catch (error) {
      this.prompt.textContent = ">>>";
      this.write(
        "repl-note",
        error instanceof PythonHungError
          ? "That was still running after 3 seconds, so Python was restarted. The session starts fresh."
          : `Something went wrong: ${String(error)}`,
      );
    } finally {
      this.busy = false;
      this.log.scrollTop = this.log.scrollHeight;
    }
  }

  private async reset(): Promise<void> {
    await this.client.call("replReset", {}).catch(() => {});
    this.log.replaceChildren();
    this.prompt.textContent = ">>>";
    this.write("repl-note", "Session reset. All variables are forgotten.");
  }

  private write(className: string, text: string): void {
    this.log.append(h("pre", { class: className }, text));
  }
}
