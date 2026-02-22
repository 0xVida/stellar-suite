export interface RateLimitConfig {
    /** Maximum number of times to retry a rate-limited request. Default: 3 */
    maxRetries: number;
    /** Initial backoff time in milliseconds before the first retry. Default: 1000 */
    initialBackoffMs: number;
    /** Maximum backoff time in milliseconds. Default: 30000 */
    maxBackoffMs: number;
}

export enum RateLimitStatus {
    Healthy = 'healthy',
    RateLimited = 'rate_limited',
}

export interface RateLimitEvent {
    status: RateLimitStatus;
    endpoint: string;
    /** The estimated time when the rate limit will reset, if known. */
    resetTime?: Date;
    /** Informational message regarding the rate limit status. */
    message?: string;
}

/**
 * Interface representing a request waiting in the queue.
 */
export interface QueuedRequest {
    execute: () => Promise<Response>;
    resolve: (value: Response) => void;
    reject: (reason?: any) => void;
    /** The time this request was added to the queue */
    enqueuedAt: number;
}
