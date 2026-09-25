import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PyClient, PythonHungError, StoppedError, type ClientStatus, type WorkerLike } from "./client";
import type { SnippetResult, WorkerMessage, WorkerRequest } from "./protocol";

const HANG = Symbol("hang");

/** A stand-in for the Pyodide worker: answers requests with `respond`, or never (HANG). */
class FakeWorker implements WorkerLike {
  onmessage: ((event: { data: WorkerMessage }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  received: WorkerRequest[] = [];
  terminated = false;

  constructor(private respond: (request: WorkerRequest) => unknown) {}

  boot(): void {
    this.emit({ kind: "ready", pythonVersion: "3.14.2", loadMs: 1234 });
  }

  emit(message: WorkerMessage): void {
    this.onmessage?.({ data: message });
  }

  postMessage(request: WorkerRequest): void {
    this.received.push(request);
    const result = this.respond(request);
    if (result !== HANG) {
      queueMicrotask(() => this.emit({ kind: "response", id: request.id, ok: true, result }));
    }
  }

  terminate(): void {
    this.terminated = true;
  }
}

function ok(output: string): SnippetResult {
  return { status: "ok", output, error: null, lines_run: 1, duration_ms: 1 };
}

describe("PyClient", () => {
  let workers: FakeWorker[];
  let statuses: ClientStatus[];
  let respond: (request: WorkerRequest) => unknown;

  function makeClient(options: { keepSpare?: boolean } = {}): PyClient {
    return new PyClient({
      createWorker: () => {
        const worker = new FakeWorker((request) => respond(request));
        workers.push(worker);
        return worker;
      },
      timeoutMs: 3000,
      onStatus: (status) => statuses.push(status),
      ...options,
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    workers = [];
    statuses = [];
    respond = (request) => ok(`ran ${request.id}`);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for Python to load, then returns the result", async () => {
    const client = makeClient();
    const pending = client.call("runSnippet", { code: "print(1)" });
    await vi.advanceTimersByTimeAsync(0);
    expect(workers[0]!.received).toHaveLength(0); // not ready yet

    workers[0]!.boot();
    await expect(pending).resolves.toMatchObject({ status: "ok" });
    expect(workers[0]!.received[0]).toMatchObject({ kind: "runSnippet", args: { code: "print(1)" } });
    expect(statuses.at(-1)).toMatchObject({ state: "ready", pythonVersion: "3.14.2" });
  });

  it("keeps a spare worker warm once the first is ready", async () => {
    makeClient();
    expect(workers).toHaveLength(1);
    workers[0]!.boot();
    await vi.advanceTimersByTimeAsync(0);
    expect(workers).toHaveLength(2);
  });

  it("runs requests one at a time, in order", async () => {
    const client = makeClient({ keepSpare: false });
    const releases: Array<() => void> = [];
    respond = (request) => {
      releases.push(() => workers[0]!.emit({ kind: "response", id: request.id, ok: true, result: ok("done") }));
      return HANG;
    };
    workers[0]!.boot();
    const first = client.call("runSnippet", { code: "a" });
    const second = client.call("runSnippet", { code: "b" });
    await vi.advanceTimersByTimeAsync(0);
    expect(workers[0]!.received.map((r) => r.args)).toEqual([{ code: "a" }]);

    releases[0]!();
    await first;
    await vi.advanceTimersByTimeAsync(0);
    expect(workers[0]!.received.map((r) => r.args)).toEqual([{ code: "a" }, { code: "b" }]);
    releases[1]!();
    await expect(second).resolves.toMatchObject({ output: "done" });
  });

  it("replaces a hung worker with the warm spare", async () => {
    const client = makeClient();
    workers[0]!.boot();
    await vi.advanceTimersByTimeAsync(0);
    workers[1]!.boot(); // the spare finishes loading

    respond = () => HANG;
    const hung = client.call("runSnippet", { code: "sum(range(10**12))" });
    const caught = hung.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await caught).toBeInstanceOf(PythonHungError);
    expect(workers[0]!.terminated).toBe(true);

    respond = (request) => ok(`ran ${request.id}`);
    await expect(client.call("runSnippet", { code: "print(2)" })).resolves.toMatchObject({ status: "ok" });
    expect(workers[1]!.received).toHaveLength(1); // the spare took over immediately
    expect(workers).toHaveLength(3); // and a new spare is loading
  });

  it("does not time out a request that answers in time", async () => {
    const client = makeClient();
    workers[0]!.boot();
    await client.call("runSnippet", { code: "x = 1" });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(workers[0]!.terminated).toBe(false);
  });

  it("rejects with the worker's message when a request fails", async () => {
    const client = makeClient();
    respond = (request) => {
      queueMicrotask(() => workers[0]!.emit({ kind: "response", id: request.id, ok: false, message: "boom" }));
      return HANG;
    };
    workers[0]!.boot();
    await expect(client.call("runSnippet", { code: "" })).rejects.toThrow("boom");
  });

  it("reports a load failure", async () => {
    const client = makeClient();
    workers[0]!.emit({ kind: "loadFailed", message: "pyodide.asm.wasm not found" });
    await expect(client.call("runSnippet", { code: "" })).rejects.toThrow("pyodide.asm.wasm not found");
    expect(statuses.at(-1)).toEqual({ state: "failed", message: "pyodide.asm.wasm not found" });
  });

  it("restart() abandons the running request", async () => {
    const client = makeClient({ keepSpare: false });
    workers[0]!.boot();
    respond = () => HANG;
    const running = client.call("runSnippet", { code: "while True: pass" });
    const caught = running.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);
    client.restart();
    expect(await caught).toBeInstanceOf(StoppedError);
    expect(workers[0]!.terminated).toBe(true);
    expect(workers).toHaveLength(2);
  });
});
