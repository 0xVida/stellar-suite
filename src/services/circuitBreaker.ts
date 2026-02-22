/**
 * Circuit breaker states
 */
export enum CircuitState {
    CLOSED = 'closed',        // Normal operation
    OPEN = 'open',            // Failing, rejecting requests
    HALF_OPEN = 'half_open'   // Testing if service recovered
}

/**
 * Circuit breaker statistics
 */
export interface CircuitBreakerStats {
    state: CircuitState;
    successCount: number;
    failureCount: number;
    lastFailureTime: number | null;
    lastSuccessTime: number | null;
    consecutiveFailures: number;
    openedAt: number | null;
    totalRequests: number;
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
    /** Failure threshold before opening circuit */
    failureThreshold?: number;
    /** Number of consecutive failures required to open */
    consecutiveFailuresThreshold?: number;
    /** Time in milliseconds before attempting to half-open */
    resetTimeout?: number;
    /** Number of successful requests needed to close circuit from half-open */
    successThreshold?: number;
}

/**
 * Circuit breaker implementation following the circuit breaker pattern.
 * Prevents cascading failures by failing fast when downstream service is unavailable.
 */
export class CircuitBreaker {
    private state: CircuitState = CircuitState.CLOSED;
    private successCount = 0;
    private failureCount = 0;
    private consecutiveFailures = 0;
    private lastFailureTime: number | null = null;
    private lastSuccessTime: number | null = null;
    private openedAt: number | null = null;
    private resetTimeout: NodeJS.Timeout | null = null;

    private readonly config: Required<CircuitBreakerConfig> = {
        failureThreshold: 5,
        consecutiveFailuresThreshold: 3,
        resetTimeout: 60000, // 1 minute
        successThreshold: 2
    };

    constructor(config?: CircuitBreakerConfig) {
        if (config) {
            this.config = { ...this.config, ...config };
        }
    }

    /**
     * Check if request is allowed based on circuit state
     */
    public canAttempt(): boolean {
        if (this.state === CircuitState.CLOSED || this.state === CircuitState.HALF_OPEN) {
            return true;
        }

        // If open, check if reset timeout has elapsed
        if (this.state === CircuitState.OPEN && this.openedAt) {
            if (Date.now() - this.openedAt >= this.config.resetTimeout) {
                this.transitionToHalfOpen();
                return true;
            }
            return false;
        }

        return false;
    }

    /**
     * Record a successful request
     */
    public recordSuccess(): void {
        this.successCount++;
        this.lastSuccessTime = Date.now();
        this.consecutiveFailures = 0;

        if (this.state === CircuitState.HALF_OPEN) {
            this.successCount++;
            if (this.successCount >= this.config.successThreshold) {
                this.transitionToClosed();
            }
        }
    }

    /**
     * Record a failed request
     */
    public recordFailure(): void {
        this.failureCount++;
        this.lastFailureTime = Date.now();
        this.consecutiveFailures++;

        // Transition to open if thresholds exceeded
        if (
            this.consecutiveFailures >= this.config.consecutiveFailuresThreshold ||
            this.failureCount >= this.config.failureThreshold
        ) {
            this.transitionToOpen();
        }
    }

    /**
     * Get current circuit state
     */
    public getState(): CircuitState {
        return this.state;
    }

    /**
     * Get circuit breaker statistics
     */
    public getStats(): CircuitBreakerStats {
        return {
            state: this.state,
            successCount: this.successCount,
            failureCount: this.failureCount,
            lastFailureTime: this.lastFailureTime,
            lastSuccessTime: this.lastSuccessTime,
            consecutiveFailures: this.consecutiveFailures,
            openedAt: this.openedAt,
            totalRequests: this.successCount + this.failureCount
        };
    }

    /**
     * Manually reset the circuit breaker
     */
    public reset(): void {
        this.transitionToClosed();
    }

    /**
     * Dispose of timers
     */
    public dispose(): void {
        if (this.resetTimeout) {
            clearTimeout(this.resetTimeout);
            this.resetTimeout = null;
        }
    }

    // ============================================================
    // Private Methods
    // ============================================================

    private transitionToClosed(): void {
        this.state = CircuitState.CLOSED;
        this.successCount = 0;
        this.failureCount = 0;
        this.consecutiveFailures = 0;
        this.openedAt = null;

        if (this.resetTimeout) {
            clearTimeout(this.resetTimeout);
            this.resetTimeout = null;
        }
    }

    private transitionToOpen(): void {
        this.state = CircuitState.OPEN;
        this.openedAt = Date.now();
        this.successCount = 0;

        // Schedule automatic reset attempt
        if (this.resetTimeout) {
            clearTimeout(this.resetTimeout);
        }
        this.resetTimeout = setTimeout(() => {
            this.transitionToHalfOpen();
        }, this.config.resetTimeout);
    }

    private transitionToHalfOpen(): void {
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
    }
}
