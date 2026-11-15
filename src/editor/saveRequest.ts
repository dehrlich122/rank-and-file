// Checking a "Save to the repo" request (dev only): the plain rules, apart from the file writing that
// scripts/save-level-plugin.ts does. Nothing is written outside `drafts/`, whatever the request says.

/** Where the dev server takes a save: the plugin listens there, and the editor posts to it. */
export const SAVE_PATH = "/__rank-and-file/save-level";
export const MAX_SAVE_BYTES = 256 * 1024;
const MAX_ID_LENGTH = 60;

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

interface SaveFile {
  path: string; // relative to the repo root, always inside drafts/
  text: string;
}

type SaveCheck = { ok: true; files: SaveFile[]; overwrite: boolean } | { ok: false; status: 400 | 413; reason: string };

const refuse = (reason: string, status: 400 | 413 = 400): SaveCheck => ({ ok: false, status, reason });
const lf = (text: string) => text.replace(/\r\n?/g, "\n");

/** The files a request asks for (the level, and the solution when there is one), or why it is refused. */
export function checkSaveRequest(body: unknown, byteLength = 0): SaveCheck {
  if (byteLength > MAX_SAVE_BYTES) return refuse("That is too big to save.", 413);
  if (typeof body !== "object" || body === null || Array.isArray(body)) return refuse("The request must be a JSON object.");
  const { id, yaml, solution, overwrite } = body as Record<string, unknown>;
  if (typeof id !== "string" || id.length > MAX_ID_LENGTH || !ID.test(id)) return refuse("The id must be lowercase letters and digits with single dashes between, up to 60 characters.");
  if (typeof yaml !== "string") return refuse("The level must be text.");
  if (solution !== undefined && typeof solution !== "string") return refuse("The solution must be text.");
  const files: SaveFile[] = [{ path: `drafts/${id}.yaml`, text: lf(yaml) }];
  if (typeof solution === "string" && solution.trim()) files.push({ path: `drafts/${id}.py`, text: lf(solution) });
  return { ok: true, files, overwrite: overwrite === true };
}
