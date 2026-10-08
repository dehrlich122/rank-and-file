// The small form controls the editor's properties tabs are made of (M4.2, M4.3): a labelled field and the inputs in it.
// Each takes the value and says what changed; none of them judges it.
import { h } from "./dom";

export const field = (label: string, control: HTMLElement, note?: string, name?: string) =>
  h("label", { class: "field", "data-field": name }, h("span", { class: "field-label" }, label), control, note ? h("span", { class: "muted small" }, note) : null);

export function textInput(value: string, on: (value: string) => void, attrs: Record<string, string> = {}): HTMLInputElement {
  const input = h("input", { type: "text", value, ...attrs });
  input.addEventListener("input", () => on(input.value));
  return input;
}

export function textArea(value: string, rows: number, on: (value: string) => void): HTMLTextAreaElement {
  const area = h("textarea", { rows: String(rows) }, value);
  area.addEventListener("input", () => on(area.value));
  return area;
}

export function numberInput(value: number | undefined, min: number, on: (value: number | undefined) => void): HTMLInputElement {
  const input = h("input", { type: "number", min: String(min), value: value === undefined ? "" : String(value) });
  input.addEventListener("input", () => on(input.value === "" ? undefined : Number(input.value)));
  return input;
}

export function select(value: string, choices: string[], on: (value: string) => void): HTMLSelectElement {
  const box = h("select", {}, ...choices.map((choice) => h("option", { value: choice, selected: choice === value }, choice)));
  box.addEventListener("change", () => on(box.value));
  return box;
}

export function check(label: Node | string, on: boolean, change: (on: boolean) => void): HTMLElement {
  const input = h("input", { type: "checkbox", checked: on });
  input.addEventListener("change", () => change(input.checked));
  return h("label", { class: "check" }, input, label);
}

export function radio(group: string, label: string, on: boolean, choose: () => void): HTMLElement {
  const input = h("input", { type: "radio", name: group, checked: on });
  input.addEventListener("change", () => input.checked && choose());
  return h("label", { class: "check" }, input, label);
}

/** "12 of 600", kept up to date as the text changes; it goes over-limit (and says so) past `limit`. */
export function counter(source: HTMLTextAreaElement | HTMLInputElement, limit: number): HTMLElement {
  const note = h("span", { class: "muted small counter" });
  const update = () => {
    note.textContent = `${source.value.length} of ${limit}`;
    note.classList.toggle("over", source.value.length > limit);
  };
  source.addEventListener("input", update);
  update();
  return note;
}
