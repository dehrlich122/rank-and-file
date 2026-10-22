// The Share dialog (M4.3): checks that a level is ready to share, using the engine, then gives a link, a code and a
// .yaml file. Nothing here judges a rule: the engine accepts the level and runs the kept solution; this only reads
// what it answered and words it.
import type { Draft } from "../editor/draft";
import { draftToLevelData, draftToYaml } from "../editor/levelData";
import { readPar, readSolution } from "../editor/rules";
import type { PyClient } from "../py/client";
import type { ErrorInfo, LevelResult } from "../py/protocol";
import { encodeLevel, shareLink, ShareError } from "../share/codec";
import { dialogHead, modal } from "./dialog";
import { download, fileName } from "./download";
import { h } from "./dom";

/** What the engine said about loading the level. */
type Accepted = { ok: true } | { ok: false; error: string };

/** The parts of a run's answer the checks read. */
interface RunAnswer {
  status: LevelResult["status"];
  summary: string;
  code_lines: number;
  error: Pick<ErrorInfo, "friendly"> | null;
  cases: { label: string; status: string; summary: string; error: Pick<ErrorInfo, "friendly"> | null }[];
}

interface CheckLine {
  ok: boolean;
  text: string;
  /** For a par that is out of reach: the par that would do (the line's button sets it). */
  setPar?: number;
}

/** The three check lines, from the engine's answers: the level loaded, the kept solution's run (null: none was run), the par. */
export function shareChecks(accepted: Accepted, solution: string, run: RunAnswer | null, par: number | null): CheckLine[] {
  const lines: CheckLine[] = [accepted.ok ? { ok: true, text: "The engine accepts the level." } : { ok: false, text: accepted.error }];

  let needs: number | null = null;
  if (!solution.trim()) {
    lines.push({ ok: false, text: "No solution kept yet. Solve the level in test-play and keep your code." });
  } else if (!run) {
    lines.push({ ok: false, text: "Your solution can't be checked until the engine accepts the level." });
  } else if (run.status === "solved") {
    needs = run.code_lines;
    const where = run.cases.length > 1 ? `all ${run.cases.length} boards` : "the level";
    lines.push({ ok: true, text: `Your solution solves ${where} in ${needs} ${needs === 1 ? "line" : "lines"}.` });
  } else {
    const failed = run.cases.find((c) => c.status !== "solved");
    const reason = failed ? `${failed.label}: ${failed.error?.friendly || failed.summary}` : run.error?.friendly || run.summary;
    lines.push({ ok: false, text: `Your solution no longer solves this level (${reason}). Test-play it again.` });
  }

  if (par === null) lines.push({ ok: true, text: "No par is set." });
  else if (needs === null) lines.push({ ok: false, text: "Par can't be checked until your solution solves the level." });
  else if (par >= needs) lines.push({ ok: true, text: `Par (${par} lines) is within reach of your solution.` });
  else lines.push({ ok: false, text: `Par is ${par} lines, but your solution needs ${needs}.`, setPar: needs });
  return lines;
}

/** Opens the Share dialog for the level `whole()` returns. `setParTo` changes the par as an undoable edit. */
export function openShareDialog(client: PyClient, whole: () => Draft, setParTo: (lines: number) => void): void {
  let generation = 0; // a check that finishes after a newer one started, or after the dialog closed, is ignored
  const checks = h("ul", { class: "share-checks", "aria-live": "polite" });
  const out = h("div", { class: "share-out blocked" });
  const dialog: HTMLDialogElement = h(
    "dialog",
    { class: "share-dialog", "aria-labelledby": "share-title" },
    dialogHead("share-title", "Share this level", "Close", () => dialog.close()),
    checks,
    h("p", { class: "muted small" }, "What travels: the title, boards, rules, hints and your solution. Nothing else: no name, nothing from your browser. The part of a link after # is never sent to a server."),
    out,
  );
  const open = modal(dialog);
  dialog.addEventListener("close", () => {
    generation++;
    dialog.remove();
  });

  const item = (mark: string, text: string, button?: HTMLElement) => h("li", {}, h("span", { "aria-hidden": "true" }, mark), h("span", {}, text), ...(button ? [button] : []));

  const copyRow = (field: HTMLInputElement | HTMLTextAreaElement, label: string, enabled: boolean) => {
    const note = h("span", { class: "muted small", role: "status" });
    const button = h("button", { class: "btn btn-small", disabled: !enabled, "aria-label": label }, "Copy");
    button.addEventListener("click", () => {
      void navigator.clipboard.writeText(field.value).then(
        () => (note.textContent = "Copied."),
        () => {
          field.select();
          note.textContent = "Press Ctrl+C to copy";
        },
      );
    });
    return h("div", { class: "share-copy" }, field, button, note);
  };

  const renderOut = (code: string | null) => {
    const enabled = code !== null;
    const link = h("input", { type: "text", readonly: true, disabled: !enabled, "aria-label": "Link", value: enabled ? shareLink(code) : "" });
    const text = h("textarea", { readonly: true, rows: "3", disabled: !enabled, "aria-label": "Code, to paste into My levels" });
    text.value = code ?? "";
    const yaml = h("button", { class: "btn btn-small", disabled: !enabled, onClick: () => download(`${fileName(whole().title)}.yaml`, draftToYaml(whole())) }, "Download a .yaml file");
    out.className = enabled ? "share-out" : "share-out blocked";
    out.replaceChildren(
      h("label", { class: "small muted" }, "LINK"),
      copyRow(link, "Copy the link", enabled),
      h("label", { class: "small muted" }, "CODE, TO PASTE INTO MY LEVELS"),
      copyRow(text, "Copy the code", enabled),
      yaml,
    );
  };

  async function run(): Promise<void> {
    const mine = ++generation;
    checks.replaceChildren(item("…", "Checking…"));
    renderOut(null);
    const level = draftToLevelData(whole());
    const solution = readSolution(whole());
    const par = readPar(whole());
    let lines: CheckLine[];
    let code: string | null = null;
    try {
      const loaded = await client.call("loadLevel", { level });
      const accepted: Accepted = loaded.ok ? { ok: true } : { ok: false, error: loaded.error };
      const answer = loaded.ok && solution.trim() ? await client.call("runLevel", { level, code: solution, hintsUsed: 0, solutionSeen: false }) : null;
      lines = shareChecks(accepted, solution, answer, par);
      if (lines.every((line) => line.ok)) {
        try {
          code = await encodeLevel(level);
        } catch (error) {
          if (!(error instanceof ShareError)) throw error;
          lines.push({ ok: false, text: error.message });
        }
      }
    } catch (error) {
      lines = [{ ok: false, text: `The checks couldn't run: ${error instanceof Error ? error.message : String(error)}` }];
    }
    if (mine !== generation) return;
    checks.replaceChildren(
      ...lines.map((line) =>
        item(
          line.ok ? "✓" : "✗",
          line.text,
          line.setPar === undefined
            ? undefined
            : h(
                "button",
                {
                  class: "btn btn-small",
                  onClick: () => {
                    setParTo(line.setPar ?? 0);
                    void run();
                  },
                },
                `Set par to ${line.setPar}`,
              ),
        ),
      ),
    );
    renderOut(code);
  }

  document.body.append(dialog);
  open();
  void run();
}
