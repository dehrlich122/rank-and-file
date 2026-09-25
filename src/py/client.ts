// UI-side handle on the Python worker.
//
// - `call()` sends one request at a time and resolves with the worker's result.
// - A wall-clock watchdog catches code that hangs where Python's own line budget
//   can't see it (e.g. one enormous built-in computation). When it fires, the
//   worker is terminated and replaced.
// - A spare worker is kept warm in the background, so replacing one is instant
//   instead of costing another Pyodide cold start.
import type { ReadyInfo, RequestKind, Requests, WorkerMessage, WorkerRequest } from "./protocol";

/** The part of the Worker API the client uses; tests pass a fake. */
export interface WorkerLike {
  postMessage(message: WorkerRequest): void;
  terminate(): void;
  onmessage: ((event: { data: WorkerMessage }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export type ClientStatus =
  | { state: "loading" }
  | ({ state: "ready" } & ReadyInfo)
  | { state: "failed"; message: string };

/** The watchdog stopped a request that ran too long. */
export class PythonHungError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Python didn't finish within ${timeoutMs / 1000} seconds.`);
    this.name = "PythonHungError";
  }
}

/** The worker couldn't start, or crashed. */
export class WorkerFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkerFailedError";
  }
}

/** A request stopped on purpose via `restart()`. */
export class StoppedError extends Error {
  constructor() {
    super("Stopped.");
    this.name = "StoppedError";
  }
}

interface Pending {
  resolve(value: unknown): void;
  reject(error: Error): void;
}

/** One worker, whether it has finished loading, and the requests waiting on it. */
class Slot {
  readonly ready: Promise<ReadyInfo>;
  readonly pending = new Map<number, Pending>();
  private loaded = false;

  constructor(
    readonly worker: WorkerLike,
    onCrash: (slot: Slot, error: Error) => void,
  ) {
    this.ready = new Promise((resolve, reject) => {
      worker.onmessage = ({ data }) => {
        if (data.kind === "ready") {
          this.loaded = true;
          resolve({ pythonVersion: data.pythonVersion, loadMs: data.loadMs });
        } else if (data.kind === "loadFailed") {
          reject(new WorkerFailedError(data.message));
        } else {
          const pending = this.pending.get(data.id);
          if (!pending) return;
          this.pending.delete(data.id);
          if (data.ok) pending.resolve(data.result);
          else pending.reject(new Error(data.message));
        }
      };
      worker.onerror = (event) => {
        const error = new WorkerFailedError(describeErrorEvent(event));
        reject(error);
        this.failAll(error);
        if (this.loaded) onCrash(this, error);
      };
    });
    this.ready.catch(() => {}); // observed by callers; don't report as unhandled
  }

  kill(reason: Error): void {
    this.worker.onmessage = null;
    this.worker.onerror = null;
    this.worker.terminate();
    this.failAll(reason);
  }

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}

export interface PyClientOptions {
  createWorker: () => WorkerLike;
  /** How long one request may run before the worker is replaced. Default 3000 ms. */
  timeoutMs?: number;
  /** Keep a second worker loaded so a replacement is instant. Default true. */
  keepSpare?: boolean;
  onStatus?: (status: ClientStatus) => void;
}

export class PyClient {
  private readonly createWorker: () => WorkerLike;
  private readonly timeoutMs: number;
  private readonly keepSpare: boolean;
  private readonly onStatus: (status: ClientStatus) => void;
  private active: Slot;
  private spare: Slot | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private nextId = 1;

  constructor(options: PyClientOptions) {
    this.createWorker = options.createWorker;
    this.timeoutMs = options.timeoutMs ?? 3000;
    this.keepSpare = options.keepSpare ?? true;
    this.onStatus = options.onStatus ?? (() => {});
    this.active = this.activate(this.spawn());
  }

  /** Resolves once Python has loaded and can run code. */
  ready(): Promise<ReadyInfo> {
    return this.active.ready;
  }

  /** Send a request. Requests run one at a time, in the order they were made. */
  call<K extends RequestKind>(kind: K, args: Requests[K]["args"]): Promise<Requests[K]["result"]> {
    const result = this.queue.then(() => this.send(kind, args));
    this.queue = result.catch(() => undefined);
    return result;
  }

  /** Abandon whatever is running and switch to a fresh worker. */
  restart(): void {
    this.replaceActive(new StoppedError());
  }

  dispose(): void {
    const reason = new StoppedError();
    this.active.kill(reason);
    this.spare?.kill(reason);
    this.spare = null;
  }

  private async send<K extends RequestKind>(kind: K, args: Requests[K]["args"]): Promise<Requests[K]["result"]> {
    const slot = this.active;
    await slot.ready;
    if (slot !== this.active) throw new StoppedError(); // replaced while we waited
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const watchdog = setTimeout(() => {
        if (slot === this.active) this.replaceActive(new PythonHungError(this.timeoutMs));
      }, this.timeoutMs);
      slot.pending.set(id, {
        resolve: (value) => {
          clearTimeout(watchdog);
          resolve(value as Requests[K]["result"]);
        },
        reject: (error) => {
          clearTimeout(watchdog);
          reject(error);
        },
      });
      slot.worker.postMessage({ id, kind, args });
    });
  }

  private spawn(): Slot {
    return new Slot(this.createWorker(), (slot, error) => {
      if (slot === this.active) this.replaceActive(error);
      else if (slot === this.spare) this.spare = null;
    });
  }

  private activate(slot: Slot): Slot {
    this.onStatus({ state: "loading" });
    slot.ready.then(
      (info) => {
        if (slot !== this.active) return;
        this.onStatus({ state: "ready", ...info });
        if (this.keepSpare && !this.spare) this.spare = this.spawn();
      },
      (error: Error) => {
        if (slot === this.active) this.onStatus({ state: "failed", message: error.message });
      },
    );
    return slot;
  }

  private replaceActive(reason: Error): void {
    const old = this.active;
    this.active = this.activate(this.spare ?? this.spawn());
    this.spare = null;
    old.kill(reason);
  }
}

/** Start the real Pyodide worker (src/py/worker.ts). */
export function startPythonWorker(): WorkerLike {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  return worker as unknown as WorkerLike; // Worker's handler types are wider than WorkerLike's
}

function describeErrorEvent(event: unknown): string {
  if (event && typeof event === "object" && "message" in event && typeof event.message === "string") {
    return event.message;
  }
  return "The Python worker crashed.";
}
