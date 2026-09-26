// Milestone 0 harness: run any Python in the worker and see exactly what comes
// back. Handy for checking the engine without a level around it.
import { PythonHungError, StoppedError, type PyClient } from "./py/client";
import type { SnippetResult } from "./py/protocol";
import { h } from "./ui/dom";
import { createEditor, getCode, setCode } from "./ui/editor";
import { errorCard } from "./ui/panels";

const EXAMPLES: Array<{ label: string; code: string }> = [
  {
    label: "Hello",
    code: 'print("Hello from real Python!")\n\nfor i in range(3):\n    print("counting", i)\n',
  },
  {
    label: "Endless loop",
    code: "# This loop never ends. The engine's line budget stops it,\n# and Python stays loaded.\nsteps = 0\nwhile True:\n    steps += 1\n",
  },
  {
    label: "Stuck in C",
    code:
      "# One giant built-in calculation. No lines of *your* code run while it\n" +
      "# works, so the line budget can't see it. The watchdog stops it instead.\n" +
      "print(sum(range(10**12)))\n",
  },
  {
    label: "Syntax error",
    code: 'print("this line is fine")\nprint("this one is missing a bracket"\nprint("never reached")\n',
  },
  {
    label: "Runtime error",
    code: 'pawn = "ready"\nprint(pwan)\n',
  },
];

export function mountHarness(root: HTMLElement, client: PyClient): () => void {
  const runButton = h("button", { class: "btn btn-primary", onClick: () => void run() }, "Run ▶");
  const stopButton = h("button", { class: "btn", disabled: true, onClick: () => client.restart() }, "Stop ■");
  const meta = h("div", { class: "run-meta" }, "Press Run (or Ctrl+Enter).");
  const output = h("pre", { class: "output" });
  const errorBox = h("div", { class: "error-card", hidden: true });
  const editorHost = h("div", { class: "editor" });

  const examples = h(
    "div",
    { class: "examples" },
    h("span", { class: "muted" }, "Try:"),
    ...EXAMPLES.map(({ label, code }) =>
      h("button", { class: "btn btn-small", onClick: () => (setCode(editor, code), void run()) }, label),
    ),
  );

  root.replaceChildren(
    h(
      "div",
      { class: "harness" },
      h(
        "div",
        { class: "harness-main" },
        h("section", { class: "panel" }, h("div", { class: "toolbar" }, runButton, stopButton), editorHost, examples),
        h("section", { class: "panel" }, h("h2", {}, "Output"), meta, output, errorBox),
      ),
    ),
  );

  const editor = createEditor({ parent: editorHost, code: EXAMPLES[0]!.code, onRun: () => void run() });
  let running = false;

  async function run(): Promise<void> {
    if (running) return;
    running = true;
    runButton.disabled = true;
    stopButton.disabled = false;
    meta.textContent = "Running…";
    output.textContent = "";
    errorBox.hidden = true;
    errorBox.replaceChildren();
    const started = performance.now();
    try {
      const result = await client.call("runSnippet", { code: getCode(editor) });
      showResult(result, performance.now() - started);
    } catch (error) {
      showFailure(error);
    } finally {
      running = false;
      runButton.disabled = false;
      stopButton.disabled = true;
    }
  }

  function showResult(result: SnippetResult, roundTripMs: number): void {
    const timing = `${result.lines_run.toLocaleString()} lines · Python ${result.duration_ms.toFixed(1)} ms · round trip ${roundTripMs.toFixed(0)} ms`;
    const label = { ok: "✓ Finished", error: "✗ Error", timeout: "⏱ Stopped" }[result.status];
    meta.textContent = `${label} · ${timing}`;
    output.textContent = result.output || "(no output)";
    if (result.error) showError(errorCard(result.error));
  }

  function showFailure(error: unknown): void {
    if (error instanceof PythonHungError) {
      meta.textContent = "⏱ Stopped by the watchdog";
      showError(
        h(
          "p",
          {},
          `Your program was still busy after ${error.timeoutMs / 1000} seconds, so Python was stopped and ` +
            "restarted. It's ready again, so you can press Run straight away.",
        ),
      );
    } else if (error instanceof StoppedError) {
      meta.textContent = "■ Stopped";
    } else {
      meta.textContent = "✗ Something went wrong";
      showError(h("p", {}, error instanceof Error ? error.message : String(error)));
    }
  }

  function showError(content: HTMLElement): void {
    errorBox.replaceChildren(content);
    errorBox.hidden = false;
  }

  return () => editor.destroy();
}
