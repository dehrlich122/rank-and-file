// Web Worker that hosts Python (Pyodide) off the UI thread.
//
// On start it loads Pyodide from our own server (public/pyodide/), copies the
// engine's .py files into Pyodide's virtual filesystem, and then answers
// requests by calling engine/rankfile/bridge.py. If player code hangs, the UI
// terminates this whole worker; see client.ts.
import type { loadPyodide as LoadPyodide } from "pyodide";
import type { ReadyInfo, RequestKind, Requests, WorkerMessage, WorkerRequest } from "./protocol";

// Bundled at build time as raw text; edits hot-reload in dev.
const engineFiles = import.meta.glob<string>("../../engine/rankfile/*.py", {
  query: "?raw",
  import: "default",
  eager: true,
});

interface WorkerScope {
  postMessage(message: WorkerMessage): void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
}
const scope = self as unknown as WorkerScope;

/** The functions in engine/rankfile/bridge.py. Each returns a JSON string. */
interface Bridge {
  run_snippet(code: string): string;
  load_level(levelJson: string): string;
  load_sandbox(apiJson: string): string;
  run_level(levelJson: string, code: string, hintsUsed: number): string;
  run_sandbox(code: string, apiJson: string): string;
  repl_push(line: string): string;
  repl_reset(): string;
}

async function boot(): Promise<{ bridge: Bridge; info: ReadyInfo }> {
  const started = performance.now();
  // Load Pyodide's own loader from the same folder as its runtime files, so the
  // two always match (and Vite doesn't try to bundle Node-only code paths).
  const indexURL = new URL(`${import.meta.env.BASE_URL}pyodide/`, self.location.origin).href;
  const { loadPyodide } = (await import(/* @vite-ignore */ `${indexURL}pyodide.mjs`)) as {
    loadPyodide: typeof LoadPyodide;
  };
  const pyodide = await loadPyodide({ indexURL });

  pyodide.FS.mkdirTree("/engine/rankfile");
  for (const [path, source] of Object.entries(engineFiles)) {
    const name = path.slice(path.lastIndexOf("/") + 1);
    pyodide.FS.writeFile(`/engine/rankfile/${name}`, source);
  }
  pyodide.runPython("import sys; sys.path.insert(0, '/engine')");

  const bridge = pyodide.pyimport("rankfile.bridge") as unknown as Bridge;
  const pythonVersion = pyodide.runPython("import sys; sys.version.split()[0]") as string;
  return { bridge, info: { pythonVersion, loadMs: Math.round(performance.now() - started) } };
}

const booting = boot();
booting.then(
  ({ info }) => scope.postMessage({ kind: "ready", ...info }),
  (error: unknown) => scope.postMessage({ kind: "loadFailed", message: String(error) }),
);

const handlers: { [K in RequestKind]: (bridge: Bridge, args: Requests[K]["args"]) => Requests[K]["result"] } = {
  runSnippet: (bridge, { code }) => JSON.parse(bridge.run_snippet(code)),
  loadLevel: (bridge, { level }) => JSON.parse(bridge.load_level(JSON.stringify(level))),
  loadSandbox: (bridge, { api }) => JSON.parse(bridge.load_sandbox(JSON.stringify(api))),
  runLevel: (bridge, { level, code, hintsUsed }) => JSON.parse(bridge.run_level(JSON.stringify(level), code, hintsUsed)),
  runSandbox: (bridge, { code, api }) => JSON.parse(bridge.run_sandbox(code, JSON.stringify(api))),
  replPush: (bridge, { line }) => JSON.parse(bridge.repl_push(line)),
  replReset: (bridge) => JSON.parse(bridge.repl_reset()),
};

scope.onmessage = async ({ data: request }) => {
  const { id, kind, args } = request;
  try {
    const { bridge } = await booting;
    const handler = handlers[kind] as (bridge: Bridge, args: unknown) => unknown;
    scope.postMessage({ kind: "response", id, ok: true, result: handler(bridge, args) });
  } catch (error) {
    scope.postMessage({ kind: "response", id, ok: false, message: String(error) });
  }
};
