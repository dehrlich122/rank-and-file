// Pieces shared by the game's dialogs (Settings, the solution comparison) and
// its confirm steps (Reset progress, "Show me a solution"). Confirm steps are
// always part of the page, never browser pop-ups, which block the page (and
// the e2e checks).
import { h } from "./dom";

/**
 * Makes a <dialog> modal: a click on its backdrop closes it, and focus goes
 * back to where it was. Returns the function that opens it.
 */
export function modal(dialog: HTMLDialogElement): () => void {
  let returnFocus: HTMLElement | null = null;
  dialog.addEventListener("close", () => returnFocus?.focus());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  return () => {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
  };
}

/** A dialog's title row, with the button that closes it. */
export function dialogHead(id: string, title: string, closeLabel: string, close: () => void): HTMLElement {
  return h("div", { class: "dialog-head" }, h("h2", { id }, title), h("button", { class: "btn btn-small", onClick: close }, closeLabel));
}

/** A question with a "yes" that can't be undone and a "no". Focuses the "yes" button once it's in the page. */
export function confirmStep(question: string, yes: string, no: string, answer: (yes: boolean) => void): HTMLElement {
  const yesButton = h("button", { class: "btn btn-small btn-danger", onClick: () => answer(true) }, yes);
  queueMicrotask(() => yesButton.focus());
  return h(
    "div",
    { class: "confirm-step" },
    h("p", {}, question),
    h("div", { class: "choices" }, yesButton, h("button", { class: "btn btn-small", onClick: () => answer(false) }, no)),
  );
}
