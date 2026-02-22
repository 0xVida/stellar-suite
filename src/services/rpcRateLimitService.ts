import { RateLimitConfig, RateLimitEvent, RateLimitStatus, QueuedRequest } from '../types/rpcRateLimit';

export class RpcRateLimiter {
    private config: RateLimitConfig;
    private queue: QueuedRequest[] = [];
    private isRateLimited = false;
    private rateLimitResetTime: number = 0;
    private currentBackoffMs: number;

    private listeners: ((event: RateLimitEvent) => void)[] = [];

    public onStatusChange(listener: (event: RateLimitEvent) => void): void {
        this.listeners.push(listener);
    }

    private fireStatusChange(event: RateLimitEvent): void {
        for (const listener of this.listeners) {
            listener(event);
        }
    }

    constructor(config?: Partial<RateLimitConfig>) {
        this.config = {
            maxRetries: config?.maxRetries ?? 3,
            initialBackoffMs: config?.initialBackoffMs ?? 1000,
            maxBackoffMs: config?.maxBackoffMs ?? 30000,
        };
        this.currentBackoffMs = this.config.initialBackoffMs;
    }

    /**
     * Executes a fetch request with automatic rate-limit handling (retries and queuing).
     * @param url The URL to fetch
     * @param options Fetch options
     * @returns Promise resolving to the Response
     */
    public async fetch(url: string, options?: RequestInit): Promise<Response> {
        return this.executeWithRetry(() => this.nativeFetch(url, options), url, 0);
    }

    /**
     * Returns true if currently in a rate-limited state.
     */
    public getIsRateLimited(): boolean {
        return this.isRateLimited;
    }

    /**
     * Calculates the time remaining until rate limits are expected to lift.
     */
    public getRemainingBackoffMs(): number {
        if (!this.isRateLimited) return 0;
        return Math.max(0, this.rateLimitResetTime - Date.now());
    }

    private nativeFetch(url: string, options?: RequestInit): Promise<Response> {
        // We use the global fetch. AbortSignal handling should be done by the caller in `options`
        return fetch(url, options);
    }

    private async executeWithRetry(
        requestFn: () => Promise<Response>,
        url: string,
        attempt: number
    ): Promise<Response> {
        // If we know we are currently rate-limited, wait in the queue before even trying
        if (this.isRateLimited) {
            await this.waitForRateLimit();
        }

        const executeTime = Date.now();
        let response: Response;

        try {
            response = await requestFn();
        } catch (error) {
            // If fetch entirely fails (network error, abort), just let it bubble up
            throw error;
        }

        // 429 Too Many Requests
        if (response.status === 429) {
            return this.handleRateLimitEncountered(requestFn, response, url, attempt);
        }

        // If a request succeeds, and we were previously rate limited, we can recover
        if (this.isRateLimited && Date.now() >= this.rateLimitResetTime) {
            this.recoverFromRateLimit(url);
        }

        return response;
    }

    private async handleRateLimitEncountered(
        requestFn: () => Promise<Response>,
        response: Response,
        url: string,
        attempt: number
    ): Promise<Response> {

        if (attempt >= this.config.maxRetries) {
            // We exhausted retries, return the 429 response directly
            return response;
        }

        // Parse Retry-After header if available
        let backoffMs = this.calculateBackoff(response.headers, attempt);

        this.enterRateLimitedState(url, backoffMs);

        // Wait for the exact backoff time
        await this.delay(backoffMs);

        // Try again
        return this.executeWithRetry(requestFn, url, attempt + 1);
    }

    private calculateBackoff(headers: Headers, attempt: number): number {
        const retryAfter = headers.get('Retry-After');
        let backoffMs = this.currentBackoffMs * Math.pow(2, attempt);

        if (retryAfter) {
            // Retry-After can be seconds in integer, or an HTTP-date
            const secondsStr = parseInt(retryAfter, 10);
            if (!isNaN(secondsStr) && String(secondsStr) === retryAfter.trim()) {
                backoffMs = secondsStr * 1000;
            } else {
                const date = new Date(retryAfter);
                if (!isNaN(date.getTime())) {
                    backoffMs = Math.max(0, date.getTime() - Date.now());
                }
            }
        }

        return Math.min(backoffMs, this.config.maxBackoffMs);
    }

    private enterRateLimitedState(url: string, backoffMs: number): void {
        const resetTime = Date.now() + backoffMs;
        // Extend reset time if multiple requests hit limits
        if (!this.isRateLimited || resetTime > this.rateLimitResetTime) {
            this.rateLimitResetTime = resetTime;
        }

        if (!this.isRateLimited) {
            this.isRateLimited = true;
            this.fireStatusChange({
                status: RateLimitStatus.RateLimited,
                endpoint: url,
                resetTime: new Date(this.rateLimitResetTime),
                message: `RPC Endpoint rate limit reached. Backing off for ${Math.round(backoffMs / 1000)}s...`
            });

            // Schedule recovery check
            setTimeout(() => this.processQueue(), backoffMs);
        }
    }

    private recoverFromRateLimit(url: string): void {
        this.isRateLimited = false;
        this.currentBackoffMs = this.config.initialBackoffMs; // Reset backoff multiplier

        this.fireStatusChange({
            status: RateLimitStatus.Healthy,
            endpoint: url,
            message: 'RPC endpoint rate limit recovered.'
        });

        this.processQueue();
    }

    private waitForRateLimit(): Promise<void> {
        return new Promise<void>((resolve) => {
            // We enqueue a completely empty request representation just to pause execution flow
            // Note: we don't store the actual fetch execution here, just a resolver to wait
            const queued: QueuedRequest = {
                execute: async () => new Response(), // Dummy value, not really used here
                resolve: () => resolve(),
                reject: () => resolve(), // Even on reject, we unblock and let it try
                enqueuedAt: Date.now()
            };
            this.queue.push(queued);
        });
    }

    private processQueue(): void {
        if (this.isRateLimited && Date.now() < this.rateLimitResetTime) {
            // Still limited, wait
            return;
        }

        // We are no longer limited, flush queue
        const toProcess = [...this.queue];
        this.queue = [];

        for (const req of toProcess) {
            req.resolve(new Response()); // Resolving unblocks `waitForRateLimit`
        }
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    public updateConfig(newConfig: Partial<RateLimitConfig>): void {
        this.config = { ...this.config, ...newConfig };
    }

    public dispose(): void {
        this.listeners = [];
        // Clear pending queue by rejecting
        for (const req of this.queue) {
            req.reject(new Error("RateLimiter disposed"));
        }
        this.queue = [];
    }
}
