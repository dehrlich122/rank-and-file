// "Save to the repo" (dev only): the editor posts a draft here and it lands in drafts/ at the repo root.
// `apply: "serve"` keeps it out of every build. The request is checked by src/editor/saveRequest.ts.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkSaveRequest, MAX_SAVE_BYTES } from "../src/editor/saveRequest.ts";

const SAVE_PATH = "/__rank-and-file/save-level";

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
          const checked = checkSaveRequest(body, size);
          if (!checked.ok) return reply(checked.status, { reason: checked.reason });
          if (existsSync(join(root, checked.files[0]!.path)) && !checked.overwrite) return reply(409, { exists: true });
          mkdirSync(join(root, "drafts"), { recursive: true });
          for (const file of checked.files) writeFileSync(join(root, file.path), file.text, "utf8");
          reply(200, { saved: checked.files.map((file) => file.path) });
        });
      });
    },
  };
}
