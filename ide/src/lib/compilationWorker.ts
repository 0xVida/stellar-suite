/**
 * CompilationWorker
 *
 * Manages the lifecycle of the compile Web Worker:
 *   - Lazy spawning (worker only created when needed, never during SSR)
 *   - Typed message passing
 *   - AbortController-based cancellation forwarded to the worker
 *   - Automatic restart (up to MAX_RESTARTS times) after a worker crash,
 *     with all in-flight jobs failed so callers receive a real error
 */

/** Messages sent from the main thread to the worker. */
type WorkerInbound =
  | { type: 'compile'; id: string; url: string; payload: unknown }
  | { type: 'cancel'; id: string };

/** Messages received from the worker on the main thread. */
export type WorkerOutbound =
  | { type: 'chunk'; id: string; data: string }
  | { type: 'done'; id: string; ok: boolean; status?: number; output: string; wasmBase64?: string }
  | { type: 'error'; id: string; message: string }
  | { type: 'cancelled'; id: string }
  | { type: 'sri-error'; url: string; expected: string; actual: string }
  | { type: 'status'; phase: string; memoryMb?: number };

export interface CompileResult {
  ok: boolean;
  status: number;
  output: string;
}

interface PendingJob {
  id: string;
  onChunk: (data: string) => void;
  resolve: (result: CompileResult) => void;
  reject: (err: Error) => void;
}

const WORKER_PATH = '/workers/compile.worker.js';
const LOCAL_WORKER_PATH = '/workers/local-compiler.worker.js';
const MAX_RESTARTS = 3;

export class CompilationWorker {
  private worker: Worker | null = null;
  private jobs = new Map<string, PendingJob>();
  private restartCount = 0;
  private workerPath: string;

  constructor(useLocalCompiler: boolean = false) {
    this.workerPath = useLocalCompiler ? LOCAL_WORKER_PATH : WORKER_PATH;
  }

  private spawn(): void {
    this.worker = new Worker(this.workerPath);
    this.worker.onmessage = (e: MessageEvent<WorkerOutbound>) =>
      this.handleMessage(e.data);
    this.worker.onerror = (e: ErrorEvent) => this.handleCrash(e);
  }

  private handleMessage(msg: WorkerOutbound): void {
    const job = this.jobs.get(msg.id);
    if (!job && msg.type !== 'status') return;

    switch (msg.type) {
      case 'chunk':
        job!.onChunk(msg.data);
        break;

      case 'done':
        this.jobs.delete(msg.id);
        job!.resolve({ ok: msg.ok, status: msg.status ?? 0, output: msg.output });
        break;

      case 'error':
        this.jobs.delete(msg.id);
        job!.reject(new Error(msg.message));
        break;

      case 'cancelled': {
        this.jobs.delete(msg.id);
        const cancelErr = new Error('Build cancelled') as Error & {
          cancelled: true;
        };
        cancelErr.cancelled = true;
        job!.reject(cancelErr);
        break;
      }

      case 'status':
        // Status updates are informational; could be logged or forwarded if needed
        break;

      case 'sri-error': {
        const sriErr = new Error(`[security] WASM integrity check failed for: ${msg.url}\n[security] Expected: ${msg.expected} | Got: ${msg.actual}\n[security] Build aborted to prevent execution of potentially tampered code.`);
        sriErr.name = "SRIIntegrityError";
        for (const job of this.jobs.values()) {
          job.reject(sriErr);
        }
        this.jobs.clear();
        this.worker?.terminate();
        this.worker = null;
        break;
      }
    }
  }

  private handleCrash(e: ErrorEvent): void {
    const crashError = new Error(e.message || 'Compilation worker crashed');

    // Fail all pending jobs immediately
    for (const job of this.jobs.values()) {
      job.reject(crashError);
    }
    this.jobs.clear();
    this.worker = null;

    // Attempt automatic restart
    if (this.restartCount < MAX_RESTARTS) {
      this.restartCount++;
      this.spawn();
    }
  }

  /** Post a compile request to the worker and stream results back. */
  compile(
    id: string,
    url: string,
    payload: unknown,
    onChunk: (data: string) => void,
  ): Promise<CompileResult> {
    if (typeof window === 'undefined') {
      return Promise.reject(new Error('Workers are not available in SSR'));
    }
    if (!this.worker) this.spawn();

    return new Promise<CompileResult>((resolve, reject) => {
      this.jobs.set(id, { id, onChunk, resolve, reject });
      const msg: WorkerInbound = { type: 'compile', id, url, payload };
      this.worker!.postMessage(msg);
    });
  }

  /** Abort an in-progress compile job by its id. */
  cancel(id: string): void {
    if (!this.worker) return;
    const msg: WorkerInbound = { type: 'cancel', id };
    this.worker.postMessage(msg);
  }

  /** Terminate the worker and reject all pending jobs. */
  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const job of this.jobs.values()) {
      job.reject(new Error('Worker terminated'));
    }
    this.jobs.clear();
  }
}
