/**
 * Deployment retry type definitions.
 * Covers configuration, status tracking, history, and error classification.
 */

/** Error categories that determine whether a deployment failure is retryable */
export enum DeploymentErrorClass {
    /** Transient network or infrastructure issue — safe to retry */
    TRANSIENT = 'transient',
    /** Permanent error (bad input, auth failure) — retrying won't help */
    PERMANENT = 'permanent',
    /** Operation was explicitly cancelled by the user */
    CANCELLED = 'cancelled',
}

/** Lifecycle states of a retry-managed deployment */
export enum DeploymentRetryStatus {
    /** No attempt has been made yet */
    IDLE = 'idle',
    /** A deployment attempt is currently running */
    RUNNING = 'running',
    /** Waiting before the next retry attempt */
    WAITING = 'waiting',
    /** Deployment succeeded (possibly after retries) */
    SUCCEEDED = 'succeeded',
    /** All retry attempts exhausted without success */
    FAILED = 'failed',
    /** Operation was cancelled mid-flight or between retries */
    CANCELLED = 'cancelled',
}

/**
 * Configuration for the exponential backoff retry policy.
 * All fields are optional — sensible defaults are applied by the service.
 */
export interface DeploymentRetryConfig {
    /** Maximum number of deployment attempts (initial + retries). Default: 3 */
    maxAttempts?: number;
    /** Delay before the first retry, in milliseconds. Default: 1000 */
    initialDelayMs?: number;
    /** Upper bound on backoff delay, in milliseconds. Default: 30000 */
    maxDelayMs?: number;
    /** Multiplier applied to the delay after each failure. Default: 2 */
    backoffMultiplier?: number;
    /** When true, adds random jitter to prevent thundering-herd retries. Default: true */
    useJitter?: boolean;
    /** Per-attempt timeout in milliseconds. Default: 60000 */
    attemptTimeoutMs?: number;
    /** Error types that should trigger a retry. Defaults to TRANSIENT only. */
    retryableErrors?: DeploymentErrorClass[];
}

/** Snapshot of a single deployment attempt */
export interface DeploymentAttemptRecord {
    /** 1-based attempt number */
    attempt: number;
    /** ISO timestamp when this attempt started */
    startedAt: string;
    /** ISO timestamp when this attempt ended */
    finishedAt: string;
    /** Whether this attempt succeeded */
    success: boolean;
    /** Duration of this attempt in milliseconds */
    durationMs: number;
    /** Error message if the attempt failed */
    error?: string;
    /** Classified error type, if applicable */
    errorClass?: DeploymentErrorClass;
    /** Delay that will be waited before the next attempt (absent on last attempt) */
    nextRetryDelayMs?: number;
}

/** Full retry session record stored in history */
export interface DeploymentRetryRecord {
    /** Unique identifier for this retry session */
    id: string;
    /** Path to the WASM file being deployed */
    wasmPath: string;
    /** Network targeted by this deployment */
    network: string;
    /** Source account used for the deployment */
    source: string;
    /** ISO timestamp when the first attempt started */
    startedAt: string;
    /** ISO timestamp when the session ended (success, failure, or cancel) */
    finishedAt?: string;
    /** Final status of the retry session */
    status: DeploymentRetryStatus;
    /** Ordered list of individual attempt records */
    attempts: DeploymentAttemptRecord[];
    /** Contract ID if deployment ultimately succeeded */
    contractId?: string;
    /** Transaction hash if deployment ultimately succeeded */
    transactionHash?: string;
    /** Human-readable summary of the final outcome */
    summary?: string;
}

/** Live status update emitted during an active retry session */
export interface DeploymentRetryEvent {
    /** Session ID this event belongs to */
    sessionId: string;
    /** Current status of the session */
    status: DeploymentRetryStatus;
    /** Which attempt just ran or is about to run (1-based) */
    currentAttempt: number;
    /** Maximum attempts configured */
    maxAttempts: number;
    /** Milliseconds until the next retry fires (only present in WAITING state) */
    nextRetryInMs?: number;
    /** Most recent error message, if any */
    lastError?: string;
    /** Human-readable progress message */
    message: string;
}
