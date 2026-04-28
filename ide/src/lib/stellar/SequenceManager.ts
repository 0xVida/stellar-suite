/**
 * src/lib/stellar/SequenceManager.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Advanced Sequence Number Manager for High-Throughput Submission — Issue #655
 *
 * Prevents "sequence too low" errors during rapid / parallel transaction
 * submission by maintaining a local, monotonically-increasing sequence counter
 * and an ordered in-memory queue.
 *
 * Features:
 *  • In-memory FIFO queue for outgoing transactions
 *  • Optimistic local sequence bumping (no round-trip per tx)
 *  • Automatic sequence recovery on BAD_SEQ / tx_bad_seq RPC errors
 *  • Configurable per-tx retry budget with exponential back-off
 *  • EventEmitter-style hooks for UI feedback
 *
 * Usage:
 *   const mgr = await SequenceManager.create(accountId, rpcUrl);
 *   const result = await mgr.enqueue(buildXdr, { maxRetries: 3 });
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Server } from "@stellar/stellar-sdk/rpc";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/** Function that constructs a signed XDR envelope given the correct sequence. */
export type TransactionBuilder = (sequence: bigint) => Promise<string>;

/** Status of a queued transaction. */
export type QueuedTxStatus =
  | "pending"
  | "building"
  | "submitting"
  | "success"
  | "failed"
  | "retrying";

/** Immutable snapshot of a queued item (safe to expose to UI). */
export interface QueuedTxSnapshot {
  id: string;
  status: QueuedTxStatus;
  sequence: bigint | null;
  attempt: number;
  maxRetries: number;
  hash: string | null;
  error: string | null;
  enqueuedAt: string;
  completedAt: string | null;
}

/** Outcome returned from `enqueue()` after all retry attempts. */
export interface SubmissionResult {
  success: boolean;
  id: string;
  hash: string | null;
  finalSequence: bigint | null;
  attempts: number;
  error?: string;
}

/** Options for a single enqueue call. */
export interface EnqueueOptions {
  /** How many times to retry on sequence/network errors (default: 3). */
  maxRetries?: number;
  /** Base back-off in ms between retries (doubles each attempt, default: 500). */
  retryBaseMs?: number;
}

/** SequenceManager configuration. */
export interface SequenceManagerConfig {
  /** Soroban RPC endpoint URL. */
  rpcUrl: string;
  /** Account ID (G…) whose sequence counter is managed. */
  accountId: string;
  /** Allow concurrent http on localhost (default: false). */
  allowHttp?: boolean;
}

/** Event hooks for observability. */
export interface SequenceManagerEvents {
  onEnqueue?: (id: string) => void;
  onStatusChange?: (snapshot: QueuedTxSnapshot) => void;
  onRecovery?: (oldSeq: bigint, newSeq: bigint) => void;
  onComplete?: (result: SubmissionResult) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Returns true when an RPC error is a sequence mismatch we can recover from. */
function isSequenceError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("bad_seq") ||
    lower.includes("tx_bad_seq") ||
    lower.includes("sequence") ||
    lower.includes("sequence too low") ||
    lower.includes("sequence too high")
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal queue entry (mutable)
// ─────────────────────────────────────────────────────────────────────────────

interface QueueEntry {
  id: string;
  builder: TransactionBuilder;
  status: QueuedTxStatus;
  sequence: bigint | null;
  attempt: number;
  maxRetries: number;
  retryBaseMs: number;
  hash: string | null;
  error: string | null;
  enqueuedAt: string;
  completedAt: string | null;
  resolve: (result: SubmissionResult) => void;
  reject: (err: Error) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// SequenceManager
// ─────────────────────────────────────────────────────────────────────────────

export class SequenceManager {
  private readonly server: Server;
  private readonly accountId: string;
  private readonly events: SequenceManagerEvents;

  /** Local sequence counter — incremented optimistically before each submission. */
  private nextSequence: bigint;

  /** Ordered queue (FIFO). */
  private readonly queue: QueueEntry[] = [];

  /** True while the drain loop is executing. */
  private draining = false;

  private constructor(
    config: SequenceManagerConfig,
    initialSequence: bigint,
    events: SequenceManagerEvents = {}
  ) {
    this.server = new Server(config.rpcUrl, {
      allowHttp: config.allowHttp ?? false,
    });
    this.accountId = config.accountId;
    this.nextSequence = initialSequence;
    this.events = events;
  }

  // ── Factory ────────────────────────────────────────────────────────────────

  /**
   * Fetch the account's current sequence from the RPC and return a ready
   * SequenceManager.
   */
  static async create(
    config: SequenceManagerConfig,
    events: SequenceManagerEvents = {}
  ): Promise<SequenceManager> {
    const initialSequence = await SequenceManager.fetchSequence(
      new Server(config.rpcUrl, { allowHttp: config.allowHttp ?? false }),
      config.accountId
    );
    return new SequenceManager(config, initialSequence, events);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Add a transaction to the queue and return a promise that resolves once
   * the transaction is either confirmed or exhausts its retry budget.
   *
   * @param builder   Async function that builds + signs the XDR given a sequence.
   * @param options   Retry / back-off tuning.
   */
  enqueue(
    builder: TransactionBuilder,
    options: EnqueueOptions = {}
  ): Promise<SubmissionResult> {
    const { maxRetries = 3, retryBaseMs = 500 } = options;

    return new Promise<SubmissionResult>((resolve, reject) => {
      const entry: QueueEntry = {
        id: generateId(),
        builder,
        status: "pending",
        sequence: null,
        attempt: 0,
        maxRetries,
        retryBaseMs,
        hash: null,
        error: null,
        enqueuedAt: new Date().toISOString(),
        completedAt: null,
        resolve,
        reject,
      };

      this.queue.push(entry);
      this.events.onEnqueue?.(entry.id);
      this.drain();
    });
  }

  /** Immutable snapshot of all queued entries for UI consumption. */
  getQueueSnapshot(): QueuedTxSnapshot[] {
    return this.queue.map(this.toSnapshot);
  }

  /** The sequence number that will be assigned to the next enqueued tx. */
  peekNextSequence(): bigint {
    return this.nextSequence;
  }

  /**
   * Force-refresh the local sequence counter from the network.
   * Call this if you suspect the local counter has drifted (e.g. after an
   * external transaction was submitted outside this manager).
   */
  async syncSequence(): Promise<bigint> {
    const fresh = await SequenceManager.fetchSequence(this.server, this.accountId);
    const old = this.nextSequence;
    this.nextSequence = fresh;
    if (fresh !== old) {
      this.events.onRecovery?.(old, fresh);
    }
    return fresh;
  }

  // ── Private: queue drain loop ──────────────────────────────────────────────

  private drain(): void {
    if (this.draining) return;
    this.draining = true;
    this.processNext().finally(() => {
      this.draining = false;
    });
  }

  private async processNext(): Promise<void> {
    while (this.queue.length > 0) {
      const entry = this.queue[0];
      await this.processEntry(entry);
      // Remove once terminal
      if (entry.status === "success" || entry.status === "failed") {
        this.queue.shift();
      }
    }
  }

  private async processEntry(entry: QueueEntry): Promise<void> {
    while (entry.attempt <= entry.maxRetries) {
      entry.attempt++;

      // Assign the next sequence optimistically
      const assignedSeq = this.nextSequence + 1n;
      entry.sequence = assignedSeq;

      this.setStatus(entry, entry.attempt === 1 ? "building" : "retrying");

      let xdr: string;
      try {
        xdr = await entry.builder(assignedSeq);
      } catch (buildErr) {
        const msg = buildErr instanceof Error ? buildErr.message : String(buildErr);
        this.finalize(entry, false, null, msg);
        return;
      }

      this.setStatus(entry, "submitting");

      try {
        const sendResult = await this.server.sendTransaction(xdr as Parameters<typeof this.server.sendTransaction>[0]);

        if (sendResult.status === "ERROR") {
          const errMsg = (sendResult as { errorResult?: { result?: { toString?: () => string } } }).errorResult?.result?.toString?.() ?? "Transaction error";
          throw new Error(errMsg);
        }

        // Optimistically commit the sequence bump
        this.nextSequence = assignedSeq;
        this.finalize(entry, true, sendResult.hash ?? null, null);
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

        if (isSequenceError(msg)) {
          // Recover: re-fetch the real sequence from the network
          try {
            const realSeq = await SequenceManager.fetchSequence(this.server, this.accountId);
            const old = this.nextSequence;
            this.nextSequence = realSeq - 1n; // will be bumped to realSeq on next attempt
            this.events.onRecovery?.(old, realSeq);
          } catch {
            // If we can't fetch, keep going — it may succeed on retry
          }

          if (entry.attempt <= entry.maxRetries) {
            const backoff = entry.retryBaseMs * Math.pow(2, entry.attempt - 1);
            await sleep(backoff);
            continue;
          }
        }

        // Non-sequence error or retries exhausted
        entry.error = msg;
        if (entry.attempt > entry.maxRetries) {
          this.finalize(entry, false, null, msg);
          return;
        }

        const backoff = entry.retryBaseMs * Math.pow(2, entry.attempt - 1);
        await sleep(backoff);
      }
    }

    this.finalize(entry, false, null, entry.error ?? "Max retries exceeded");
  }

  private finalize(
    entry: QueueEntry,
    success: boolean,
    hash: string | null,
    error: string | null
  ): void {
    entry.status = success ? "success" : "failed";
    entry.hash = hash;
    entry.error = error;
    entry.completedAt = new Date().toISOString();

    const result: SubmissionResult = {
      success,
      id: entry.id,
      hash,
      finalSequence: entry.sequence,
      attempts: entry.attempt,
      error: error ?? undefined,
    };

    this.events.onStatusChange?.(this.toSnapshot(entry));
    this.events.onComplete?.(result);
    entry.resolve(result);
  }

  private setStatus(entry: QueueEntry, status: QueuedTxStatus): void {
    entry.status = status;
    this.events.onStatusChange?.(this.toSnapshot(entry));
  }

  private toSnapshot(entry: QueueEntry): QueuedTxSnapshot {
    return {
      id: entry.id,
      status: entry.status,
      sequence: entry.sequence,
      attempt: entry.attempt,
      maxRetries: entry.maxRetries,
      hash: entry.hash,
      error: entry.error,
      enqueuedAt: entry.enqueuedAt,
      completedAt: entry.completedAt,
    };
  }

  // ── Private: static helpers ────────────────────────────────────────────────

  private static async fetchSequence(
    server: Server,
    accountId: string
  ): Promise<bigint> {
    const account = await server.getAccount(accountId);
    return BigInt(account.sequenceNumber());
  }
}
