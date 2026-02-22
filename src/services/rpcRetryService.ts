import * as vscode from 'vscode';
import { CircuitBreaker, CircuitBreakerConfig, CircuitState } from './circuitBreaker';

/**
 * Error classification for retry decisions
 */
export enum ErrorType {
    TRANSIENT = 'transient',      // Retryable (network, timeout, throttle)
    PERMANENT = 'permanent',      // Not retryable (invalid input, auth)
    CIRCUIT_OPEN = 'circuit_open' // Circuit breaker opened
}

/**
 * Retry configuration
 */
export interface RetryConfig {
    /** Maximum number of retry attempts */
    maxAttempts?: number;
    /** Initial backoff delay in milliseconds */
    initialDelayMs?: number;
    /** Maximum backoff delay in milliseconds */
    maxDelayMs?: number;
    /** Exponential backoff multiplier */
    backoffMultiplier?: number;
    /** Add random jitter to avoid thundering herd */
    useJitter?: boolean;
    /** Timeout for individual requests in milliseconds */
    requestTimeoutMs?: number;
}

/**
 * Retry attempt result
 */
export interface RetryAttempt {
    attempt: number;
    success: boolean;
    error?: Error;
    responseTime: number;
    nextRetryDelayMs?: number;
}

/**
 * Retry statistics
 */
export interface RetryStats {
    totalAttempts: number;
    successfulAttempts: number;
    failedAttempts: number;
    totalDelayMs: number;
    averageResponseTimeMs: number;
    lastAttemptTime: number | null;
}

/**
 * RPC retry service with exponential backoff and circuit breaker pattern.
 * Implements resilient retry logic for transient failures.
 */
export class RpcRetryService {
    private circuitBreaker: CircuitBreaker;
    private retryConfig: Required<RetryConfig>;
    private retryStats: Map<string, RetryStats> = new Map();
    private retryHistory: RetryAttempt[] = [];
    private outputChannel: vscode.OutputChannel;

    constructor(
        circuitBreakerConfig?: CircuitBreakerConfig,
        retryConfig?: RetryConfig,
        private enableLogging: boolean = false
    ) {
        this.circuitBreaker = new CircuitBreaker(circuitBreakerConfig);

        this.retryConfig = {
            maxAttempts: retryConfig?.maxAttempts ?? 3,
            initialDelayMs: retryConfig?.initialDelayMs ?? 100,
            maxDelayMs: retryConfig?.maxDelayMs ?? 10000,
            backoffMultiplier: retryConfig?.backoffMultiplier ?? 2,
            useJitter: retryConfig?.useJitter ?? true,
            requestTimeoutMs: retryConfig?.requestTimeoutMs ?? 30000
        };

        this.outputChannel = vscode.window.createOutputChannel('RPC Retry');
        if (enableLogging) {
            this.outputChannel.appendLine('[Retry] Service initialized');
        }
    }

    /**
     * Execute operation with retry and circuit breaker logic
     */
    public async executeWithRetry<T>(
        operationName: string,
        operation: () => Promise<T>,
        classifyError: (error: any) => ErrorType = this.defaultErrorClassifier
    ): Promise<T> {
        const operationKey = `${operationName}-${Date.now()}`;

        // Check circuit breaker
        if (!this.circuitBreaker.canAttempt()) {
            const cbStats = this.circuitBreaker.getStats();
            if (cbStats.state === CircuitState.OPEN) {
                this.logOperation(operationKey, {
                    attempt: 0,
                    success: false,
                    error: new Error('Circuit breaker is OPEN'),
                    responseTime: 0
                });
                throw new Error(
                    `Circuit breaker OPEN for ${operationName}. Service unavailable due to repeated failures.`
                );
            }
        }

        // Initialize stats if not exists
        if (!this.retryStats.has(operationName)) {
            this.retryStats.set(operationName, {
                totalAttempts: 0,
                successfulAttempts: 0,
                failedAttempts: 0,
                totalDelayMs: 0,
                averageResponseTimeMs: 0,
                lastAttemptTime: null
            });
        }

        let lastError: Error | null = null;
        let totalDelayMs = 0;
        let responseTimes: number[] = [];

        for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
            const startTime = Date.now();

            try {
                const result = await Promise.race([
                    operation(),
                    this.createTimeout(this.retryConfig.requestTimeoutMs)
                ]);

                const responseTime = Date.now() - startTime;
                responseTimes.push(responseTime);

                // Record success
                this.circuitBreaker.recordSuccess();
                const stats = this.retryStats.get(operationName)!;
                stats.successfulAttempts++;
                stats.totalAttempts++;
                stats.lastAttemptTime = Date.now();
                stats.averageResponseTimeMs =
                    responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;

                this.logOperation(operationKey, {
                    attempt,
                    success: true,
                    responseTime
                });

                return result;
            } catch (error) {
                const responseTime = Date.now() - startTime;
                responseTimes.push(responseTime);
                lastError = error instanceof Error ? error : new Error(String(error));

                const errorType = classifyError(error);

                // Don't retry permanent errors or circuit breaker issues
                if (errorType === ErrorType.PERMANENT || errorType === ErrorType.CIRCUIT_OPEN) {
                    this.circuitBreaker.recordFailure();
                    const stats = this.retryStats.get(operationName)!;
                    stats.failedAttempts++;
                    stats.totalAttempts++;

                    this.logOperation(operationKey, {
                        attempt,
                        success: false,
                        error: lastError,
                        responseTime
                    });

                    throw lastError;
                }

                // Record failure and check if circuit should open
                this.circuitBreaker.recordFailure();

                // If last attempt, don't calculate delay
                if (attempt === this.retryConfig.maxAttempts) {
                    const stats = this.retryStats.get(operationName)!;
                    stats.failedAttempts++;
                    stats.totalAttempts++;
                    stats.totalDelayMs += totalDelayMs;

                    this.logOperation(operationKey, {
                        attempt,
                        success: false,
                        error: lastError,
                        responseTime
                    });

                    break;
                }

                // Calculate next retry delay
                const delayMs = this.calculateBackoffDelay(attempt);
                totalDelayMs += delayMs;

                this.logOperation(operationKey, {
                    attempt,
                    success: false,
                    error: lastError,
                    responseTime,
                    nextRetryDelayMs: delayMs
                });

                // Wait before retrying
                await this.delay(delayMs);
            }
        }

        // All retries exhausted
        const stats = this.retryStats.get(operationName)!;
        stats.totalAttempts += 1; // Count the final failure
        stats.totalDelayMs += totalDelayMs;

        throw new Error(
            `Operation '${operationName}' failed after ${this.retryConfig.maxAttempts} attempts: ${lastError?.message}`
        );
    }

    /**
     * Get circuit breaker state
     */
    public getCircuitState(): CircuitState {
        return this.circuitBreaker.getState();
    }

    /**
     * Get circuit breaker statistics
     */
    public getCircuitStats() {
        return this.circuitBreaker.getStats();
    }

    /**
     * Get retry statistics for an operation
     */
    public getRetryStats(operationName: string): RetryStats | undefined {
        return this.retryStats.get(operationName);
    }

    /**
     * Get all retry statistics
     */
    public getAllRetryStats(): Map<string, RetryStats> {
        return new Map(this.retryStats);
    }

    /**
     * Get recent retry history
     */
    public getRetryHistory(limit: number = 50): RetryAttempt[] {
        return this.retryHistory.slice(-limit);
    }

    /**
     * Reset circuit breaker
     */
    public resetCircuit(): void {
        this.circuitBreaker.reset();
        if (this.enableLogging) {
            this.outputChannel.appendLine('[Retry] Circuit breaker reset');
        }
    }

    /**
     * Clear all statistics
     */
    public clearStats(): void {
        this.retryStats.clear();
        this.retryHistory = [];
        if (this.enableLogging) {
            this.outputChannel.appendLine('[Retry] Statistics cleared');
        }
    }

    /**
     * Dispose of resources
     */
    public dispose(): void {
        this.circuitBreaker.dispose();
        this.outputChannel.dispose();
    }

    // ============================================================
    // Private Methods
    // ============================================================

    private defaultErrorClassifier = (error: any): ErrorType => {
        const message = error?.message?.toLowerCase?.() || String(error).toLowerCase();

        // Transient errors (retryable)
        if (
            message.includes('econnrefused') ||
            message.includes('econnreset') ||
            message.includes('etimedout') ||
            message.includes('timeout') ||
            message.includes('network') ||
            message.includes('429') || // Too many requests
            message.includes('503') || // Service unavailable
            message.includes('502') || // Bad gateway
            message.includes('504')    // Gateway timeout
        ) {
            return ErrorType.TRANSIENT;
        }

        // Permanent errors (not retryable)
        if (
            message.includes('401') || // Unauthorized
            message.includes('403') || // Forbidden
            message.includes('400') || // Bad request
            message.includes('invalid') ||
            message.includes('unauthorized') ||
            message.includes('forbidden')
        ) {
            return ErrorType.PERMANENT;
        }

        // Default to transient for unknown errors
        return ErrorType.TRANSIENT;
    };

    private calculateBackoffDelay(attempt: number): number {
        // Exponential backoff: delay = initialDelay * (multiplier ^ (attempt - 1))
        let delay = this.retryConfig.initialDelayMs * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1);

        // Cap at max delay
        delay = Math.min(delay, this.retryConfig.maxDelayMs);

        // Add jitter to prevent thundering herd
        if (this.retryConfig.useJitter) {
            const jitter = Math.random() * delay * 0.1; // ±10% jitter
            delay += jitter;
        }

        return Math.floor(delay);
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private createTimeout(ms: number): Promise<never> {
        return new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Request timeout after ${ms}ms`)), ms)
        );
    }

    private logOperation(operationKey: string, attempt: RetryAttempt): void {
        this.retryHistory.push(attempt);

        // Keep history bounded
        if (this.retryHistory.length > 1000) {
            this.retryHistory = this.retryHistory.slice(-1000);
        }

        if (this.enableLogging) {
            const status = attempt.success ? '✓' : '✗';
            const delayInfo = attempt.nextRetryDelayMs ? ` (retry in ${attempt.nextRetryDelayMs}ms)` : '';
            const errorInfo = attempt.error ? ` - ${attempt.error.message}` : '';
            this.outputChannel.appendLine(
                `[Retry] ${status} Attempt ${attempt.attempt}: ${attempt.responseTime}ms${delayInfo}${errorInfo}`
            );
        }
    }
}
