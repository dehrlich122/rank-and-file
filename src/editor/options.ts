// What the engine offers the editor (the `editorOptions` request), asked for once and kept.
import type { PyClient } from "../py/client";
import type { EditorOptions } from "../py/protocol";

let asked: Promise<EditorOptions> | null = null;

export function editorOptions(client: PyClient): Promise<EditorOptions> {
  asked ??= client.ready().then(() => client.call("editorOptions", {}));
  asked.catch(() => (asked = null)); // a failed start can be tried again
  return asked;
}
