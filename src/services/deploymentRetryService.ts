import {
    DeploymentAttemptRecord,
    DeploymentErrorClass,
    DeploymentRetryConfig,
    DeploymentRetryEvent,
    DeploymentRetryRecord,
    DeploymentRetryStatus,
} from '../types/deploymentRetry';
import { ContractDeployer, DeploymentResult } from './contractDeployer';

/** Parameters required to start a retry-managed deployment */
export interface RetryDeploymentParams {
    /** Path to the compiled WASM file */
    wasmPath: string;
    /** Target network (e.g. 'testnet', 'mainnet') */
    network: string;
    /** Source account identity */
    source: string;
    /** Stellar CLI path */
    cliPath: string;
    /** Retry policy overrides for this deployment */
    retryConfig?: DeploymentRetryConfig;
}

/** Resolved (required) retry configuration after defaults are applied */
type ResolvedRetryConfig = Required<DeploymentRetryConfig>;

const DEFAULT_CONFIG: ResolvedRetryConfig = {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    useJitter: true,
    attemptTimeoutMs: 60000,
    retryableErrors: [DeploymentErrorClass.TRANSIENT],
};

/**
 * Manages deployment retry sessions with exponential backoff.
 *
 * Key capabilities:
 * - Configurable retry attempts and backoff parameters
 * - Error classification to avoid retrying permanent failures
 * - Per-session cancellation support
 * - Status event callbacks for UI feedback
 * - Persistent retry history (bounded to avoid memory growth)
 */
export class DeploymentRetryService {
    private readonly history: DeploymentRetryRecord[] = [];
    private readonly activeSessions = new Map<string, AbortController>();
    private readonly statusListeners: Array<(event: DeploymentRetryEvent) => void> = [];

    /** Maximum number of completed sessions kept in history */
    private readonly maxHistorySize = 100;

    // ── Public API ──────────────────────────────────────────────

    /**
     * Register a listener that receives live status updates during retry sessions.
     * Returns a disposer function that removes the listener.
     */
    public onStatusChange(listener: (event: DeploymentRetryEvent) => void): () => void {
        this.statusListeners.push(listener);
        return () => {
            const idx = this.statusListeners.indexOf(listener);
            if (idx !== -1) {
                this.statusListeners.splice(idx, 1);
            }
        };
    }

    /**
     * Execute a deployment with automatic retry and exponential backoff.
     *
     * @param params  Deployment parameters and optional retry policy overrides
     * @returns       The completed retry session record
     */
    public async deploy(params: RetryDeploymentParams): Promise<DeploymentRetryRecord> {
        const config = this.resolveConfig(params.retryConfig);
        const sessionId = this.generateSessionId();
        const abortController = new AbortController();

        this.activeSessions.set(sessionId, abortController);

        const session: DeploymentRetryRecord = {
            id: sessionId,
            wasmPath: params.wasmPath,
            network: params.network,
            source: params.source,
            startedAt: new Date().toISOString(),
            status: DeploymentRetryStatus.RUNNING,
            attempts: [],
        };

        this.emit({
            sessionId,
            status: DeploymentRetryStatus.RUNNING,
            currentAttempt: 1,
            maxAttempts: config.maxAttempts,
            message: `Starting deployment (attempt 1 of ${config.maxAttempts})`,
        });

        try {
            const deployer = new ContractDeployer(params.cliPath, params.source, params.network);
            await this.runWithRetry(session, deployer, config, abortController.signal);
        } finally {
            this.activeSessions.delete(sessionId);
            session.finishedAt = new Date().toISOString();
            this.storeInHistory(session);
        }

        return session;
    }

    /**
     * Cancel an active retry session by its session ID.
     * The in-progress attempt (if any) will be allowed to finish naturally;
     * no further retries will be scheduled after cancellation.
     */
    public cancel(sessionId: string): boolean {
        const controller = this.activeSessions.get(sessionId);
        if (!controller) {
            return false;
        }
        controller.abort();
        return true;
    }

    /**
     * Cancel all currently active retry sessions.
     */
    public cancelAll(): void {
        for (const controller of this.activeSessions.values()) {
            controller.abort();
        }
    }

    /**
     * Retrieve the full retry history, most-recent first.
     */
    public getHistory(): DeploymentRetryRecord[] {
        return [...this.history].reverse();
    }

    /**
     * Retrieve a single session record by ID (searches active sessions too).
     */
    public getSession(sessionId: string): DeploymentRetryRecord | undefined {
        return this.history.find(r => r.id === sessionId);
    }

    /**
     * Clear all stored retry history.
     */
    public clearHistory(): void {
        this.history.length = 0;
    }

    /**
     * Returns the IDs of all currently running retry sessions.
     */
    public getActiveSessions(): string[] {
        return [...this.activeSessions.keys()];
    }

    /**
     * Classify a deployment error to decide whether it is retryable.
     * Exposed publicly so callers can pre-check errors before invoking deploy().
     */
    public classifyError(error: string | Error): DeploymentErrorClass {
        const message = (error instanceof Error ? error.message : error).toLowerCase();
        return classifyDeploymentError(message);
    }

    // ── Core retry loop ─────────────────────────────────────────

    private async runWithRetry(
        session: DeploymentRetryRecord,
        deployer: ContractDeployer,
        config: ResolvedRetryConfig,
        signal: AbortSignal
    ): Promise<void> {
        let lastErrorMessage: string | undefined;

        for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
            // Check for cancellation before starting each attempt
            if (signal.aborted) {
                this.markCancelled(session, attempt, config.maxAttempts);
                return;
            }

            const attemptStart = Date.now();
            const startedAt = new Date().toISOString();

            this.emit({
                sessionId: session.id,
                status: DeploymentRetryStatus.RUNNING,
                currentAttempt: attempt,
                maxAttempts: config.maxAttempts,
                lastError: lastErrorMessage,
                message: attempt === 1
                    ? `Deploying contract (attempt ${attempt} of ${config.maxAttempts})…`
                    : `Retrying deployment (attempt ${attempt} of ${config.maxAttempts})…`,
            });

            let result: DeploymentResult;
            try {
                result = await this.runWithTimeout(
                    deployer.deployContract(session.wasmPath),
                    config.attemptTimeoutMs,
                    signal
                );
            } catch (err) {
                // Timeout, abort, or unexpected exception
                const isCancelled = signal.aborted || (err instanceof Error && err.message === 'cancelled');
                const errorMessage = err instanceof Error ? err.message : String(err);
                const durationMs = Date.now() - attemptStart;

                const attemptRecord: DeploymentAttemptRecord = {
                    attempt,
                    startedAt,
                    finishedAt: new Date().toISOString(),
                    success: false,
                    durationMs,
                    error: errorMessage,
                    errorClass: isCancelled
                        ? DeploymentErrorClass.CANCELLED
                        : DeploymentErrorClass.TRANSIENT,
                };
                session.attempts.push(attemptRecord);

                if (isCancelled) {
                    this.markCancelled(session, attempt, config.maxAttempts);
                    return;
                }

                lastErrorMessage = errorMessage;

                // Timeouts are transient — schedule retry if attempts remain
                if (attempt < config.maxAttempts) {
                    const delayMs = this.calculateDelay(attempt, config);
                    attemptRecord.nextRetryDelayMs = delayMs;
                    await this.waitBeforeRetry(session, attempt, config.maxAttempts, delayMs, lastErrorMessage, signal);
                    if (signal.aborted) {
                        this.markCancelled(session, attempt + 1, config.maxAttempts);
                        return;
                    }
                }
                continue;
            }

            const durationMs = Date.now() - attemptStart;
            const errorClass = result.success
                ? undefined
                : classifyDeploymentError(result.error ?? result.errorSummary ?? '');

            const attemptRecord: DeploymentAttemptRecord = {
                attempt,
                startedAt,
                finishedAt: new Date().toISOString(),
                success: result.success,
                durationMs,
                error: result.success ? undefined : (result.error ?? result.errorSummary),
                errorClass,
            };
            session.attempts.push(attemptRecord);

            if (result.success) {
                session.status = DeploymentRetryStatus.SUCCEEDED;
                session.contractId = result.contractId;
                session.transactionHash = result.transactionHash;
                session.summary = `Deployment succeeded on attempt ${attempt} of ${config.maxAttempts}.`;

                this.emit({
                    sessionId: session.id,
                    status: DeploymentRetryStatus.SUCCEEDED,
                    currentAttempt: attempt,
                    maxAttempts: config.maxAttempts,
                    message: session.summary,
                });
                return;
            }

            // Failure path — decide whether to retry
            lastErrorMessage = result.error ?? result.errorSummary ?? 'Deployment failed';

            const shouldRetry =
                attempt < config.maxAttempts &&
                errorClass !== undefined &&
                config.retryableErrors.includes(errorClass);

            if (!shouldRetry) {
                // Permanent error or no attempts left
                session.status = DeploymentRetryStatus.FAILED;
                session.summary = errorClass === DeploymentErrorClass.PERMANENT
                    ? `Deployment failed with a permanent error: ${lastErrorMessage}`
                    : `Deployment failed after ${attempt} attempt(s): ${lastErrorMessage}`;

                this.emit({
                    sessionId: session.id,
                    status: DeploymentRetryStatus.FAILED,
                    currentAttempt: attempt,
                    maxAttempts: config.maxAttempts,
                    lastError: lastErrorMessage,
                    message: session.summary,
                });
                return;
            }

            // Schedule the next retry
            const delayMs = this.calculateDelay(attempt, config);
            attemptRecord.nextRetryDelayMs = delayMs;

            await this.waitBeforeRetry(session, attempt, config.maxAttempts, delayMs, lastErrorMessage, signal);

            if (signal.aborted) {
                this.markCancelled(session, attempt + 1, config.maxAttempts);
                return;
            }
        }

        // Fell through all attempts without success
        if (session.status === DeploymentRetryStatus.RUNNING) {
            session.status = DeploymentRetryStatus.FAILED;
            session.summary = `Deployment failed after ${config.maxAttempts} attempt(s): ${lastErrorMessage}`;

            this.emit({
                sessionId: session.id,
                status: DeploymentRetryStatus.FAILED,
                currentAttempt: config.maxAttempts,
                maxAttempts: config.maxAttempts,
                lastError: lastErrorMessage,
                message: session.summary,
            });
        }
    }

    // ── Helpers ─────────────────────────────────────────────────

    /**
     * Wait for the backoff delay, emitting WAITING status events.
     * Resolves early if the abort signal fires.
     */
    private waitBeforeRetry(
        session: DeploymentRetryRecord,
        completedAttempt: number,
        maxAttempts: number,
        delayMs: number,
        lastError: string | undefined,
        signal: AbortSignal
    ): Promise<void> {
        session.status = DeploymentRetryStatus.WAITING;

        this.emit({
            sessionId: session.id,
            status: DeploymentRetryStatus.WAITING,
            currentAttempt: completedAttempt,
            maxAttempts,
            nextRetryInMs: delayMs,
            lastError,
            message: `Attempt ${completedAttempt} failed. Retrying in ${Math.round(delayMs / 1000)}s…`,
        });

        return new Promise<void>(resolve => {
            const timer = setTimeout(() => {
                session.status = DeploymentRetryStatus.RUNNING;
                resolve();
            }, delayMs);

            // Abort early if cancelled
            const onAbort = () => {
                clearTimeout(timer);
                resolve();
            };
            signal.addEventListener('abort', onAbort, { once: true });
        });
    }

    /**
     * Race an operation against a timeout.
     * Rejects with 'cancelled' if the abort signal fires before the operation completes.
     */
    private runWithTimeout<T>(
        operation: Promise<T>,
        timeoutMs: number,
        signal: AbortSignal
    ): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Deployment attempt timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            const onAbort = () => {
                clearTimeout(timer);
                reject(new Error('cancelled'));
            };
            signal.addEventListener('abort', onAbort, { once: true });

            operation.then(
                value => {
                    clearTimeout(timer);
                    signal.removeEventListener('abort', onAbort);
                    resolve(value);
                },
                err => {
                    clearTimeout(timer);
                    signal.removeEventListener('abort', onAbort);
                    reject(err);
                }
            );
        });
    }

    /**
     * Calculate the exponential backoff delay for a given attempt number.
     * Applies optional jitter to spread out concurrent retries.
     */
    private calculateDelay(attempt: number, config: ResolvedRetryConfig): number {
        // delay = initialDelay * multiplier^(attempt - 1)
        let delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
        delay = Math.min(delay, config.maxDelayMs);

        if (config.useJitter) {
            // ±15% random jitter
            const jitterRange = delay * 0.15;
            delay += (Math.random() * 2 - 1) * jitterRange;
            delay = Math.max(0, delay);
        }

        return Math.floor(delay);
    }

    private markCancelled(
        session: DeploymentRetryRecord,
        currentAttempt: number,
        maxAttempts: number
    ): void {
        session.status = DeploymentRetryStatus.CANCELLED;
        session.summary = `Deployment cancelled after ${session.attempts.length} attempt(s).`;

        this.emit({
            sessionId: session.id,
            status: DeploymentRetryStatus.CANCELLED,
            currentAttempt,
            maxAttempts,
            message: session.summary,
        });
    }

    private resolveConfig(overrides?: DeploymentRetryConfig): ResolvedRetryConfig {
        return {
            maxAttempts: overrides?.maxAttempts ?? DEFAULT_CONFIG.maxAttempts,
            initialDelayMs: overrides?.initialDelayMs ?? DEFAULT_CONFIG.initialDelayMs,
            maxDelayMs: overrides?.maxDelayMs ?? DEFAULT_CONFIG.maxDelayMs,
            backoffMultiplier: overrides?.backoffMultiplier ?? DEFAULT_CONFIG.backoffMultiplier,
            useJitter: overrides?.useJitter ?? DEFAULT_CONFIG.useJitter,
            attemptTimeoutMs: overrides?.attemptTimeoutMs ?? DEFAULT_CONFIG.attemptTimeoutMs,
            retryableErrors: overrides?.retryableErrors ?? DEFAULT_CONFIG.retryableErrors,
        };
    }

    private storeInHistory(session: DeploymentRetryRecord): void {
        this.history.push(session);
        if (this.history.length > this.maxHistorySize) {
            this.history.splice(0, this.history.length - this.maxHistorySize);
        }
    }

    private emit(event: DeploymentRetryEvent): void {
        for (const listener of this.statusListeners) {
            try {
                listener(event);
            } catch {
                // Listeners must not crash the retry loop
            }
        }
    }

    private generateSessionId(): string {
        return `retry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
}

// ── Module-level error classifier ───────────────────────────────

/**
 * Classify a deployment error message into a retryability category.
 * Kept as a pure function so it can be tested independently.
 */
export function classifyDeploymentError(message: string): DeploymentErrorClass {
    const lower = message.toLowerCase();

    // Permanent errors — retrying will not help
    if (
        lower.includes('unauthorized') ||
        lower.includes('forbidden') ||
        lower.includes('invalid') ||
        lower.includes('not found') ||
        lower.includes('wasm file not found') ||
        lower.includes('validation') ||
        lower.includes('400') ||
        lower.includes('401') ||
        lower.includes('403') ||
        lower.includes('404')
    ) {
        return DeploymentErrorClass.PERMANENT;
    }

    // Transient errors — worth retrying
    if (
        lower.includes('network') ||
        lower.includes('timeout') ||
        lower.includes('timed out') ||
        lower.includes('econnrefused') ||
        lower.includes('econnreset') ||
        lower.includes('etimedout') ||
        lower.includes('socket') ||
        lower.includes('503') ||
        lower.includes('502') ||
        lower.includes('504') ||
        lower.includes('429') ||
        lower.includes('rate limit') ||
        lower.includes('unavailable') ||
        lower.includes('connection')
    ) {
        return DeploymentErrorClass.TRANSIENT;
    }

    // Default to transient for unknown errors — better to retry than give up
    return DeploymentErrorClass.TRANSIENT;
}
