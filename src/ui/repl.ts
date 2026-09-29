// The scratch REPL: type Python, see the answer, like the `python` prompt.
// The session lives in the worker, so variables survive between lines.
// The input is a one-line code editor, so it gets the same highlighting and
// autocomplete as the main editor, scoped to calls made in this session.
//
// There's one REPL for the whole app, shown on every level. Scratch Python has
// no board, but its session has a stand-in for the level's piece, so help(pawn.move)
// works (docs/Codex.md), and hovering a function shows the level's Codex entry.
import type { EditorView } from "@codemirror/view";
import { PythonHungError, type PyClient } from "../py/client";
import { codexHover, type CodexLookup } from "./codex";
import { callCompletion, KnownCalls } from "./completion";
import { h } from "./dom";
import { createLineEditor } from "./editor";
import { errorCard } from "./panels";

/** The level on screen, as Scratch Python needs it. */
interface ReplLevel {
  piece: string;
  api: string[];
  codex: () => CodexLookup | null;
}

export class ReplPanel {
  readonly element: HTMLElement;
  private readonly log = h("div", { class: "repl-log", "aria-live": "polite" });
  private readonly prompt = h("span", { class: "repl-prompt" }, ">>>");
  private readonly input: EditorView;
  private readonly known = new KnownCalls();
  private readonly history: string[] = [];
  private historyIndex = 0;
  private busy = false;
  private level: ReplLevel | null = null;

  constructor(private readonly client: PyClient) {
    const inputHost = h("div", { class: "repl-editor" });
    this.element = h(
      "div",
      { class: "repl" },
      h(
        "p",
        { class: "muted small" },
        "Try any Python here. Press Enter to run a line; a line ending in : starts a block, and an empty line finishes it. " +
          "help(print) explains a function.",
      ),
      this.log,
      h("div", { class: "repl-line" }, this.prompt, inputHost),
      h("div", { class: "repl-actions" }, h("button", { class: "btn btn-small", onClick: () => void this.reset() }, "Reset session")),
    );
    this.input = createLineEditor({
      parent: inputHost,
      label: "Python input",
      onSubmit: (line) => void this.submit(line),
      onHistory: (direction) => this.stepHistory(direction),
      extensions: [
        // The session's piece is only a stand-in, so only real plain calls typed here are offered.
        ...callCompletion({ known: this.known, piece: () => null, api: () => [] }),
        codexHover(() => this.level?.codex() ?? null),
      ],
    });
    this.log.addEventListener("click", () => this.input.focus());
  }

  /** The level now on screen: its piece and abilities go with every line, for the session's stand-in. */
  setLevel(level: ReplLevel): void {
    this.level = level;
  }

  private stepHistory(direction: "older" | "newer"): string | null {
    if (direction === "older" && this.historyIndex > 0) return this.history[--this.historyIndex] ?? "";
    if (direction === "newer" && this.historyIndex < this.history.length) return this.history[++this.historyIndex] ?? "";
    return null;
  }

  private async submit(line: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    if (line.trim()) this.history.push(line);
    this.historyIndex = this.history.length;
    this.write("repl-echo", `${this.prompt.textContent} ${line}`);
    try {
      const result = await this.client.call("replPush", { line, piece: this.level?.piece, api: this.level?.api });
      if (result.output) this.write("repl-out", result.output.replace(/\n$/, ""));
      if (result.error) this.log.append(errorCard(result.error));
      this.prompt.textContent = result.more ? "..." : ">>>";
    } catch (error) {
      this.prompt.textContent = ">>>";
      this.write(
        "repl-note",
        error instanceof PythonHungError
          ? `That was still running after ${error.timeoutMs / 1000} seconds, so Python was restarted. The session starts fresh.`
          : `Something went wrong: ${String(error)}`,
      );
    } finally {
      this.busy = false;
      this.log.scrollTop = this.log.scrollHeight;
    }
  }

  private async reset(): Promise<void> {
    await this.client.call("replReset", {}).catch(() => {});
    this.known.clear();
    this.log.replaceChildren();
    this.prompt.textContent = ">>>";
    this.write("repl-note", "Session reset. All variables are forgotten.");
  }

  private write(className: string, text: string): void {
    this.log.append(h("pre", { class: className }, text));
  }
}
