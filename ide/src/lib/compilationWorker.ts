/**
 * CompilationWorker
 *
 * Manages the lifecycle of the compile Web Worker:
 *   - Lazy spawning (worker only created when needed, never during SSR)
 *   - Typed message passing
 *   - AbortController-based cancellation forwarded to the worker
 *   - Timeout and memory quota supervision for browser compilation
 *   - Automatic restart (up to MAX_RESTARTS times) after a worker crash,
 *     with all in-flight jobs failed so callers receive a real error
 */

import { WorkerResourceMonitor } from "@/utils/WorkerResourceMonitor";
import { secureLoadWorker } from '@/utils/WasmLoader';

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
  | { type: 'status'; id?: string; phase: string; memoryMb?: number };

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
  private resourceMonitor = new WorkerResourceMonitor({
    onTimeout: (id, timeoutMs) => {
      this.cancelAndReject(
        id,
        `Build cancelled after exceeding the ${Math.round(timeoutMs / 1000)}s time limit.`,
      );
    },
    onMemoryExceeded: (id, memoryMb, limitMb) => {
      this.cancelAndReject(
        id,
        `Build cancelled after exceeding the ${limitMb} MB memory limit (${memoryMb} MB observed).`,
        true,
      );
    },
  });

  private spawnPromise: Promise<void> | null = null;

  constructor(useLocalCompiler: boolean = false) {
    this.workerPath = useLocalCompiler ? LOCAL_WORKER_PATH : WORKER_PATH;
  }

  private async spawn(): Promise<void> {
    if (this.spawnPromise) return this.spawnPromise;

    this.spawnPromise = (async () => {
      try {
        const objectUrl = await secureLoadWorker(this.workerPath);
        this.worker = new Worker(objectUrl);
        this.worker.onmessage = (e: MessageEvent<WorkerOutbound>) =>
          this.handleMessage(e.data);
        this.worker.onerror = (e: ErrorEvent) => this.handleCrash(e);
      } catch (err) {
        console.error("Failed to spawn worker securely:", err);
        // Clean up the promise so we can retry on next compile
        this.spawnPromise = null;
        throw err;
      }
    })();

    return this.spawnPromise;
  }

  private handleMessage(msg: WorkerOutbound): void {
    const job = 'id' in msg && typeof msg.id === 'string'
      ? this.jobs.get(msg.id)
      : undefined;
    if (!job && msg.type !== 'status' && msg.type !== 'sri-error') return;

    switch (msg.type) {
      case 'chunk':
        job!.onChunk(msg.data);
        break;

      case 'done':
        this.resourceMonitor.stop(msg.id);
        this.jobs.delete(msg.id);
        job!.resolve({ ok: msg.ok, status: msg.status ?? 0, output: msg.output });
        break;

      case 'error':
        this.resourceMonitor.stop(msg.id);
        this.jobs.delete(msg.id);
        job!.reject(new Error(msg.message));
        break;

      case 'cancelled': {
        this.resourceMonitor.stop(msg.id);
        this.jobs.delete(msg.id);
        const cancelErr = new Error('Build cancelled') as Error & {
          cancelled: true;
        };
        cancelErr.cancelled = true;
        job!.reject(cancelErr);
        break;
      }

      case 'status':
        this.recordWorkerStatus(msg);
        break;

      case 'sri-error': {
        const sriErr = new Error(`[security] WASM integrity check failed for: ${msg.url}\n[security] Expected: ${msg.expected} | Got: ${msg.actual}\n[security] Build aborted to prevent execution of potentially tampered code.`);
        sriErr.name = "SRIIntegrityError";
        for (const job of this.jobs.values()) {
          this.resourceMonitor.stop(job.id);
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
      this.resourceMonitor.stop(job.id);
      job.reject(crashError);
    }
    this.jobs.clear();
    this.worker = null;

    // Attempt automatic restart
    if (this.restartCount < MAX_RESTARTS) {
      this.restartCount++;
      this.spawn().catch(() => {});
    }
  }

  private recordWorkerStatus(msg: Extract<WorkerOutbound, { type: 'status' }>): void {
    const jobId =
      msg.id ??
      (this.jobs.size === 1 ? this.jobs.values().next().value?.id : undefined);

    if (jobId) {
      this.resourceMonitor.recordMemorySample(jobId, msg.memoryMb);
    }
  }

  private cancelAndReject(id: string, message: string, terminateWorker = false): void {
    const job = this.jobs.get(id);
    if (!job) return;

    const error = new Error(message);
    this.resourceMonitor.stop(id);
    this.jobs.delete(id);

    try {
      this.worker?.postMessage({ type: 'cancel', id } satisfies WorkerInbound);
    } catch {
      // Worker may already be unavailable; the promise is still failed below.
    }

    if (terminateWorker) {
      this.worker?.terminate();
      this.worker = null;
      for (const pending of this.jobs.values()) {
        this.resourceMonitor.stop(pending.id);
        pending.reject(new Error("Compilation worker terminated after exceeding resource limits."));
      }
      this.jobs.clear();
    }

    job.reject(error);
  }

  /** Post a compile request to the worker and stream results back. */
  async compile(
    id: string,
    url: string,
    payload: unknown,
    onChunk: (data: string) => void,
  ): Promise<CompileResult> {
    if (typeof window === 'undefined') {
      return Promise.reject(new Error('Workers are not available in SSR'));
    }
    
    try {
      if (!this.worker) await this.spawn();
    } catch (err) {
      return Promise.reject(err);
    }

    return new Promise<CompileResult>((resolve, reject) => {
      this.jobs.set(id, { id, onChunk, resolve, reject });
      this.resourceMonitor.start(id);
      const msg: WorkerInbound = { type: 'compile', id, url, payload };
      try {
        this.worker!.postMessage(msg);
      } catch (error) {
        this.resourceMonitor.stop(id);
        this.jobs.delete(id);
        reject(error instanceof Error ? error : new Error('Failed to start compilation worker'));
      }
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
    this.resourceMonitor.stopAll();
    for (const job of this.jobs.values()) {
      job.reject(new Error('Worker terminated'));
    }
    this.jobs.clear();
  }
}
