import * as vscode from 'vscode';
import { RpcEndpoint } from './cliConfigurationService';
import { RpcService, SimulationResult } from './rpcService';
import { RpcHealthMonitor, EndpointHealth } from './rpcHealthMonitor';
import { RpcRetryService, ErrorType } from './rpcRetryService';

/**
 * Service that manages multiple RPC endpoints and provides automatic failover.
 */
export class RpcFallbackService {
    private services: Map<string, RpcService> = new Map();
    private endpoints: RpcEndpoint[] = [];
    private outputChannel: vscode.OutputChannel;

    constructor(
        private readonly healthMonitor: RpcHealthMonitor,
        private readonly retryService: RpcRetryService,
        private logger?: any
    ) {
        this.outputChannel = vscode.window.createOutputChannel('RPC Fallback');
    }

    /**
     * Update the list of endpoints managed by this service.
     */
    public updateEndpoints(endpoints: RpcEndpoint[]): void {
        this.endpoints = [...endpoints];

        // Remove services for endpoints that are no longer configured
        const currentUrls = new Set(endpoints.map(e => this.normalizeUrl(e.url)));
        for (const url of this.services.keys()) {
            if (!currentUrls.has(url)) {
                this.services.delete(url);
            }
        }

        // Add services for new endpoints
        for (const endpoint of endpoints) {
            const normalizedUrl = this.normalizeUrl(endpoint.url);
            if (!this.services.has(normalizedUrl)) {
                this.services.set(normalizedUrl, new RpcService(normalizedUrl, this.logger));
            }

            // Ensure health monitor is tracking this endpoint
            this.healthMonitor.addEndpoint(normalizedUrl, endpoint.priority, false);
        }

        this.log(`Endpoints updated: ${endpoints.length} configured`);
    }

    /**
     * Get the best available service based on health and priority.
     */
    private getBestServices(): { endpoint: RpcEndpoint; service: RpcService }[] {
        const usableEndpoints = this.endpoints
            .filter(ep => ep.enabled)
            .map(ep => {
                const normalizedUrl = this.normalizeUrl(ep.url);
                const health = this.healthMonitor.getEndpointHealth(normalizedUrl);
                return {
                    endpoint: ep,
                    health: health?.status || EndpointHealth.UNKNOWN,
                    service: this.services.get(normalizedUrl)!
                };
            })
            .filter(item => item.health !== EndpointHealth.UNHEALTHY)
            .sort((a, b) => {
                // Primary sort by health status (Healthy > Degraded > Unknown)
                const healthOrder = {
                    [EndpointHealth.HEALTHY]: 0,
                    [EndpointHealth.DEGRADED]: 1,
                    [EndpointHealth.UNKNOWN]: 2,
                    [EndpointHealth.UNHEALTHY]: 3
                };
                const healthDiff = healthOrder[a.health] - healthOrder[b.health];
                if (healthDiff !== 0) return healthDiff;

                // Secondary sort by priority (lower is higher priority)
                return a.endpoint.priority - b.endpoint.priority;
            });

        return usableEndpoints.map(item => ({ endpoint: item.endpoint, service: item.service }));
    }

    /**
     * Execute a simulation with automatic failover support.
     */
    async simulateTransaction(
        contractId: string,
        functionName: string,
        args: any[]
    ): Promise<SimulationResult> {
        const candidates = this.getBestServices();

        if (candidates.length === 0) {
            return {
                success: false,
                error: 'No healthy RPC endpoints available. Please check your configuration.'
            };
        }

        let lastError: string | undefined;

        for (const { endpoint, service } of candidates) {
            try {
                this.log(`Attempting simulation on: ${endpoint.name || endpoint.url}`);

                // Use retry service for individual endpoint attempts
                const result = await this.retryService.executeWithRetry(
                    `simulate-${endpoint.url}`,
                    () => service.simulateTransaction(contractId, functionName, args)
                );

                if (result.success) {
                    return result;
                }

                // If result is not successful but it's not an exception, check if it's an endpoint error
                // In RpcService, if fetch fails or status is not ok, it returns success: false with error message
                this.log(`Endpoint ${endpoint.url} returned failure: ${result.error}`);
                lastError = result.error;

                // If it's a transient failure, we might want to try another endpoint
                // If it's a permanent failure (like invalid contract), failover won't help
                // For now, let's proceed to next endpoint if it's not successful
                continue;

            } catch (error) {
                this.log(`Error on endpoint ${endpoint.url}: ${error instanceof Error ? error.message : String(error)}`);
                lastError = error instanceof Error ? error.message : String(error);
                // Continue to next endpoint on exception
                continue;
            }
        }

        return {
            success: false,
            error: `All RPC endpoints failed. Last error: ${lastError}`
        };
    }

    /**
     * Update authentication headers for all managed RPC services.
     */
    public updateAuthHeaders(headers: Record<string, string>): void {
        for (const service of this.services.values()) {
            service.setAuthHeaders(headers);
        }
    }

    /**
     * Check if any endpoint is available.
     */
    async isAnyAvailable(): Promise<boolean> {
        const candidates = this.getBestServices();
        for (const { service } of candidates) {
            if (await service.isAvailable()) {
                return true;
            }
        }
        return false;
    }

    private normalizeUrl(url: string): string {
        return url.endsWith('/') ? url.slice(0, -1) : url;
    }

    private log(message: string): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] ${message}`);
    }

    public dispose(): void {
        this.outputChannel.dispose();
    }
}
