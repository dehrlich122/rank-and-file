// "Save to the repo" (dev only): the editor posts a draft here and it lands in drafts/ at the repo root.
// `apply: "serve"` keeps it out of every build. The request is checked by src/editor/saveRequest.ts.
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkSaveRequest, MAX_SAVE_BYTES, SAVE_PATH } from "../src/editor/saveRequest.ts";


/**
 * What one request does to `drafts/`. `{ exists: true }` (a 200, not an error the browser logs) means a file is there
 * and the request didn't say to replace it; nothing is written then. A save with no solution removes the old
 * `drafts/<id>.py` an earlier save left, and says so in `removed`. Only `drafts/<id>.yaml` and `drafts/<id>.py` for an id
 * the check accepted are ever touched.
 */
export function saveDraft(root: string, body: unknown, size: number): { status: number; body: unknown } {
  const checked = checkSaveRequest(body, size);
  if (!checked.ok) return { status: checked.status, body: { reason: checked.reason } };
  const level = checked.files[0]!.path;
  if (existsSync(join(root, level)) && !checked.overwrite) return { status: 200, body: { exists: true } };
  mkdirSync(join(root, "drafts"), { recursive: true });
  for (const file of checked.files) writeFileSync(join(root, file.path), file.text, "utf8");
  const solution = level.replace(/\.yaml$/, ".py");
  const removed = !checked.files.some((file) => file.path === solution) && existsSync(join(root, solution)) ? [solution] : [];
  for (const path of removed) rmSync(join(root, path), { force: true });
  return { status: 200, body: { saved: checked.files.map((file) => file.path), removed } };
}

export function saveLevelPlugin(root: string) {
  return {
    name: "rank-and-file-save-level",
    apply: "serve" as const,
    configureServer(server: { middlewares: { use(path: string, handler: (req: any, res: any) => void): void } }) {
      server.middlewares.use(SAVE_PATH, (req, res) => {
        const reply = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(body));
        };
        if (req.method !== "POST") return reply(405, { reason: "POST only." });
        const chunks: Buffer[] = [];
        let size = 0;
        req.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size <= MAX_SAVE_BYTES) chunks.push(chunk);
        });
        req.on("end", () => {
          let body: unknown = null;
          try {
            if (size <= MAX_SAVE_BYTES) body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          } catch {
            return reply(400, { reason: "The request must be JSON." });
          }
          const answer = saveDraft(root, body, size);
          reply(answer.status, answer.body);
        });
      });
    },
  };
}
