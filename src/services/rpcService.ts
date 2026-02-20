import { formatError } from '../utils/errorFormatter';
import { CliErrorContext, CliErrorType } from '../utils/cliErrorParser';
import { RpcLogger } from './rpcLogger';
import { StateDiff, StateSnapshot } from '../types/simulationState';
import { RpcRateLimiter } from './rpcRateLimitService';
import { RateLimitEvent, RateLimitStatus } from '../types/rpcRateLimit';
import * as vscode from 'vscode';

export interface SimulationResult {
    success: boolean;
    result?: any;
    error?: string;
    errorSummary?: string;
    errorType?: CliErrorType;
    errorCode?: string;
    errorSuggestions?: string[];
    errorContext?: CliErrorContext;
    rawError?: string;
    resourceUsage?: {
        cpuInstructions?: number;
        memoryBytes?: number;
    };
    validationWarnings?: string[];
    rawResult?: unknown;
    stateSnapshotBefore?: StateSnapshot;
    stateSnapshotAfter?: StateSnapshot;
    stateDiff?: StateDiff;
}

/**
 * Service for interacting with Stellar RPC endpoint to simulate transactions.
 */
export class RpcService {
    private rpcUrl: string;
    private logger?: any;
    private authHeaders: Record<string, string> = {};
    private rateLimiter: RpcRateLimiter;
    constructor(rpcUrl: string, logger?: any) {
        // Ensure URL ends with / for proper path joining
        this.rpcUrl = rpcUrl.endsWith('/') ? rpcUrl.slice(0, -1) : rpcUrl;
        this.logger = logger;

        const config = vscode.workspace.getConfiguration('stellarSuite.rpc.rateLimit');
        this.rateLimiter = new RpcRateLimiter({
            maxRetries: config.get<number>('maxRetries', 3),
            initialBackoffMs: config.get<number>('initialBackoffMs', 1000),
            maxBackoffMs: config.get<number>('maxBackoffMs', 30000)
        });

        this.rateLimiter.onStatusChange((event: RateLimitEvent) => {
            if (this.logger?.logRateLimitEvent) {
                this.logger.logRateLimitEvent(event);
            } else if (this.logger?.logRequest) {
                // Fallback structured logging if native rate limit method doesn't exist
                this.logger.logRequest('rate-limit', event.endpoint, event);
            }

            if (event.status === RateLimitStatus.RateLimited) {
                vscode.window.showWarningMessage(
                    event.message || `RPC Rate Limit hit for ${event.endpoint}. Retrying in background...`
                );
            } else if (event.status === RateLimitStatus.Healthy) {
                vscode.window.showInformationMessage(
                    event.message || `RPC Rate Limit recovered for ${event.endpoint}.`
                );
            }
        });
    }

    /**
     * Get the logger instance if available
     */
    public getLogger(): any {
        return this.logger;
    }

    /**
     * Simulate a Soroban contract function call using RPC.
     *
     * @param contractId - Contract ID (address)
     * @param functionName - Name of the function to call
     * @param args - Function arguments as array
     * @returns Simulation result with return value and resource usage
     */
    async simulateTransaction(
        contractId: string,
        functionName: string,
        args: any[]
    ): Promise<SimulationResult> {
        const method = 'simulateTransaction';
        const url = `${this.rpcUrl}/rpc`;
        let requestId: string | undefined;

        try {
            // Build the RPC request
            const requestBody = {
                jsonrpc: '2.0',
                id: 1,
                method: 'simulateTransaction',
                params: {
                    transaction: {
                        contractId,
                        functionName,
                        args: args.map(arg => ({
                            value: arg
                        }))
                    }
                }
            };

            // Log the request if logger available
            const requestId = this.logger?.logRequest?.(method, url, requestBody);

            // Make the RPC call with rate limiting
            const response = await this.rateLimiter.fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...this.authHeaders
                },
                body: JSON.stringify(requestBody),
                signal: AbortSignal.timeout(30000) // 30 second timeout
            });

            if (!response.ok) {
                const errorMessage = `RPC request failed with status ${response.status}: ${response.statusText}`;
                this.logger?.logError?.(requestId, method, errorMessage);
                return {
                    success: false,
                    error: errorMessage
                };
            }

            const data: any = await response.json();

            // Log the response if logger available
            this.logger?.logResponse?.(requestId, method, response.status, data);

            // Handle RPC error response
            if (data.error) {
                const errorMessage = data.error.message || 'RPC error occurred';
                this.logger?.logError?.(requestId, method, errorMessage);
                return {
                    success: false,
                    error: errorMessage
                };
            }

            // Extract result from RPC response
            const result = data.result || data;

            return {
                success: true,
                result: result.returnValue || result.result || result,
                resourceUsage: result.resourceUsage || result.resource_usage,
                rawResult: result,
            };
        } catch (error) {
            const errorMessage = this.formatErrorMessage(error);

            // Log the error if logger available
            if (requestId) {
                this.logger?.logError?.(requestId, method, error instanceof Error ? error.message : String(error));
            }

            // Handle network errors
            if (error instanceof TypeError && error.message.includes('fetch')) {
                return {
                    success: false,
                    error: `Network error: Unable to reach RPC endpoint at ${this.rpcUrl}. Check your connection and rpcUrl setting.`
                };
            }

            if (error instanceof Error && error.name === 'AbortError') {
                return {
                    success: false,
                    error: 'Request timed out. The RPC endpoint may be slow or unreachable.'
                };
            }

            const formatted = formatError(error, 'RPC');
            return {
                success: false,
                error: formatted.message
            };
        }
    }

    /**
     * Check if RPC endpoint is reachable.
     *
     * @returns True if endpoint is accessible
     */
    async isAvailable(): Promise<boolean> {
        const method = 'health-check';
        const requestId = this.logger?.logRequest?.(method, `${this.rpcUrl}/health`, {});

        try {
            const response = await this.rateLimiter.fetch(`${this.rpcUrl}/health`, {
                method: 'GET',
                headers: { ...this.authHeaders },
                signal: AbortSignal.timeout(5000)
            });

            this.logger?.logResponse?.(requestId, method, response.status, { available: response.ok });
            return response.ok;
        } catch {
            // If health endpoint doesn't exist, try a simple RPC call
            try {
                const response = await this.rateLimiter.fetch(`${this.rpcUrl}/rpc`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...this.authHeaders },
                    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }),
                    signal: AbortSignal.timeout(5000)
                });

                this.logger?.logResponse?.(requestId, method, response.status, { available: response.ok });
                return response.ok;
            } catch (error) {
                this.logger?.logError?.(requestId, method, error instanceof Error ? error.message : String(error));
                return false;
            }
        }
    }

    /**
     * Set a custom logger instance
     */
    public setLogger(logger: any): void {
        this.logger = logger;
    }

    /**
     * Set authentication headers for all RPC requests.
     */
    public setAuthHeaders(headers: Record<string, string>): void {
        this.authHeaders = { ...headers };
    }

    /**
     * Get the current RateLimiter instance
     */
    public getRateLimiter(): RpcRateLimiter {
        return this.rateLimiter;
    }

    /**
     * Get RPC timing statistics
     */
    public getTimingStats() {
        return this.logger?.getTimingStats?.();
    }

    /**
     * Get RPC error statistics
     */
    public getErrorStats() {
        return this.logger?.getErrorStats?.();
    }

    // Private helper methods

    private formatErrorMessage(error: any): string {
        if (error instanceof Error) {
            return error.message;
        }
        return String(error);
    }
}
