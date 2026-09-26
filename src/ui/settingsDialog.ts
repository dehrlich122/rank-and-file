// The Settings menu: a modal dialog, opened from the top bar or with Esc.
//
// Every change applies straight away through the settings store; there's no
// Save button. The browser's <dialog> closes on Esc and keeps keyboard focus
// inside while it's open; on close, focus goes back to where it was.
import { CODE_SIZES, SPEEDS, type CodeSize, type Settings, type SettingsStore } from "../settings";
import { h } from "./dom";

interface Choice<T> {
  value: T;
  label: string;
}

const GROUPS: Array<{ key: keyof Settings; title: string; hint?: string; choices: Choice<string | number>[] }> = [
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
    key: "codeSize",
    title: "Code text size",
    hint: "The editor, lesson examples, console and scratch Python.",
    choices: (Object.keys(CODE_SIZES) as CodeSize[]).map((size) => ({
      value: size,
      label: { small: "Small", medium: "Medium", large: "Large", "x-large": "Extra large" }[size],
    })),
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
  private returnFocus: HTMLElement | null = null;

  constructor(private readonly store: SettingsStore) {
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
              if (input.checked) this.store.set({ [group.key]: typeof choice.value === "number" ? choice.value : input.value });
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
      h(
        "div",
        { class: "settings-head" },
        h("h2", { id: "settings-title" }, "Settings"),
        h("button", { class: "btn btn-small", onClick: () => this.element.close() }, "Done"),
      ),
      ...groups,
      h("p", { class: "muted small" }, "Esc opens and closes this menu. In the code editor, Ctrl+M then Tab moves focus out of the editor."),
    );
    this.element.addEventListener("close", () => this.returnFocus?.focus());
    // A click on the backdrop (outside the card) closes the dialog too.
    this.element.addEventListener("click", (event) => {
      if (event.target === this.element) this.element.close();
    });
    this.sync(store.get());
    store.subscribe((settings) => this.sync(settings));
  }

  get isOpen(): boolean {
    return this.element.open;
  }

  open(): void {
    if (this.element.open) return;
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.element.showModal();
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
