// The Settings menu: a modal dialog, opened from the top bar or with Esc.
//
// Every change applies straight away through the settings store; there's no
// Save button. The browser's <dialog> closes on Esc and keeps keyboard focus
// inside while it's open; on close, focus goes back to where it was.
import { CODE_SIZES, SPEEDS, type CodeSize, type Settings, type SettingsStore } from "../settings";
import { confirmStep, dialogHead, modal } from "./dialog";
import { h } from "./dom";

interface Choice<T> {
  value: T;
  label: string;
}

const GROUPS: Array<{ key: keyof Settings; title: string; hint?: string; choices: Choice<string | number | boolean>[] }> = [
  {
    key: "speed",
    title: "Playback speed",
    choices: SPEEDS.map((speed) => ({ value: speed, label: `${speed}×` })),
  },
  {
    key: "theme",
    title: "Theme",
    choices: [
      { value: "system", label: "Match system" },
      { value: "light", label: "Light" },
      { value: "dark", label: "Dark" },
    ],
  },
  {
    key: "codePanel",
    title: "Code panel",
    hint: "Where the code, Variables and Console sit on a level. Narrow windows always put it at the bottom.",
    choices: [
      { value: "right", label: "Right" },
      { value: "bottom", label: "Bottom" },
      { value: "left", label: "Left" },
    ],
  },
  {
    key: "codeSize",
    title: "Code text size",
    hint: "The editor, lesson examples, console and scratch Python.",
    choices: (Object.keys(CODE_SIZES) as CodeSize[]).map((size) => ({
      value: size,
      label: { small: "Small", medium: "Medium", large: "Large", "x-large": "Extra large" }[size],
    })),
  },
  {
    key: "wrapLines",
    title: "Wrap long lines",
    hint: "In the code editor and lesson examples. The Wrap button above the editor switches it too.",
    choices: [
      { value: true, label: "On" },
      { value: false, label: "Off" },
    ],
  },
  {
    key: "motion",
    title: "Animations",
    choices: [
      { value: "system", label: "Match system" },
      { value: "full", label: "Full" },
      { value: "reduced", label: "Reduced" },
    ],
  },
];

export class SettingsDialog {
  readonly element: HTMLDialogElement;
  private readonly inputs: HTMLInputElement[] = [];
  private readonly openListeners = new Set<() => void>();
  private readonly show: () => void;

  constructor(
    private readonly store: SettingsStore,
    /** Settings → Reset progress, once the player has confirmed it. */
    onResetProgress: () => void,
  ) {
    const groups = GROUPS.map((group) =>
      h(
        "fieldset",
        {},
        h("legend", {}, group.title),
        group.hint ? h("p", { class: "muted small" }, group.hint) : null,
        h(
          "div",
          { class: "choices" },
          ...group.choices.map((choice) => {
            const input = h("input", {
              type: "radio",
              name: `setting-${group.key}`,
              value: String(choice.value),
              "data-key": group.key,
            });
            input.addEventListener("change", () => {
              if (input.checked) this.store.set({ [group.key]: choice.value });
            });
            this.inputs.push(input);
            return h("label", { class: "choice" }, input, h("span", {}, choice.label));
          }),
        ),
      ),
    );
    this.element = h(
      "dialog",
      { class: "settings-dialog", "aria-labelledby": "settings-title" },
      dialogHead("settings-title", "Settings", "Done", () => this.element.close()),
      ...groups,
      resetProgress(onResetProgress),
      h("p", { class: "muted small" }, "Esc opens and closes this menu. In the code editor, Ctrl+M then Tab moves focus out of the editor."),
    );
    this.show = modal(this.element);
    this.sync(store.get());
    store.subscribe((settings) => this.sync(settings));
  }

  open(): void {
    if (this.element.open) return;
    this.show();
    for (const listener of this.openListeners) listener();
  }

  /** Run `listener` whenever the menu opens (e.g. to pause playback). Returns an unsubscribe function. */
  onOpen(listener: () => void): () => void {
    this.openListeners.add(listener);
    return () => this.openListeners.delete(listener);
  }

  private sync(settings: Settings): void {
    for (const input of this.inputs) {
      const key = input.dataset.key as keyof Settings;
      input.checked = String(settings[key]) === input.value;
    }
  }
}

/** Settings → Reset progress, with its confirm step (see dialog.ts). */
function resetProgress(onReset: () => void): HTMLElement {
  const slot = h("div", {});
  const startOver = (note?: string) => {
    const button = h("button", { class: "btn btn-small", onClick: ask }, "Reset progress…");
    slot.replaceChildren(button, ...(note ? [h("p", { class: "muted small" }, note)] : []));
    return button;
  };
  function ask(): void {
    slot.replaceChildren(
      confirmStep("Delete every solved level, star and hint, and the code you wrote? This can't be undone.", "Yes, reset", "Cancel", (yes) => {
        if (yes) onReset();
        startOver(yes ? "Progress reset." : undefined).focus();
      }),
    );
  }
  startOver();
  return h(
    "fieldset",
    { class: "reset-progress" },
    h("legend", {}, "Progress"),
    h("p", { class: "muted small" }, "Solved levels, stars, hints and your code are saved in this browser."),
    slot,
  );
}
