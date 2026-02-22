import * as vscode from 'vscode';

// ============================================================
// Type Definitions & Enums
// ============================================================

export enum EndpointHealth {
    HEALTHY = 'healthy',
    DEGRADED = 'degraded',
    UNHEALTHY = 'unhealthy',
    UNKNOWN = 'unknown'
}

export interface HealthCheckResult {
    endpoint: string;
    status: EndpointHealth;
    responseTime: number;
    timestamp: number;
    error?: string;
    consecutiveFailures: number;
}

export interface EndpointConfig {
    url: string;
    priority: number; // Lower = higher priority
    fallback: boolean; // If true, use as fallback endpoint
}

export interface HealthMonitorConfig {
    checkInterval: number; // ms between checks
    failureThreshold: number; // consecutive failures before marking unhealthy
    timeout: number; // ms for health check timeout
    maxHistory: number; // max health check history per endpoint
    enableLogging: boolean;
}

// ============================================================
// RPC Health Monitor Service
// ============================================================

export class RpcHealthMonitor {
    private endpoints: Map<string, EndpointConfig> = new Map();
    private healthStatus: Map<string, HealthCheckResult> = new Map();
    private healthHistory: Map<string, HealthCheckResult[]> = new Map();
    private config: Required<HealthMonitorConfig>;
    private checkIntervals: Map<string, NodeJS.Timeout> = new Map();
    private outputChannel: vscode.OutputChannel;
    private healthChangeEmitter = new vscode.EventEmitter<void>();
    readonly onHealthChange = this.healthChangeEmitter.event;

    constructor(
        context: vscode.ExtensionContext,
        config: Partial<HealthMonitorConfig> = {}
    ) {
        this.config = {
            checkInterval: config.checkInterval ?? 30000, // 30 seconds
            failureThreshold: config.failureThreshold ?? 3,
            timeout: config.timeout ?? 5000,
            maxHistory: config.maxHistory ?? 100,
            enableLogging: config.enableLogging ?? false
        };

        this.outputChannel = vscode.window.createOutputChannel('RPC Health Monitor');
    }

    /**
     * Add endpoint to monitor.
     */
    addEndpoint(url: string, priority: number = 0, fallback: boolean = false): void {
        const normalizedUrl = this.normalizeUrl(url);
        if (this.endpoints.has(normalizedUrl)) {
            // Update priority and fallback if already exists
            const existing = this.endpoints.get(normalizedUrl)!;
            this.endpoints.set(normalizedUrl, { ...existing, priority, fallback });
            this.log(`Endpoint updated: ${normalizedUrl} (priority: ${priority})`);
            return;
        }

        this.endpoints.set(normalizedUrl, { url: normalizedUrl, priority, fallback });
        this.healthStatus.set(normalizedUrl, {
            endpoint: normalizedUrl,
            status: EndpointHealth.UNKNOWN,
            responseTime: 0,
            timestamp: Date.now(),
            consecutiveFailures: 0
        });
        this.healthHistory.set(normalizedUrl, []);
        this.log(`Endpoint added: ${normalizedUrl} (priority: ${priority})`);

        // If monitoring is already active for others, start for this one
        if (this.checkIntervals.size > 0 && !this.checkIntervals.has(normalizedUrl)) {
            this.startMonitoringForEndpoint(normalizedUrl);
        }
    }

    /**
     * Remove endpoint from monitor.
     */
    removeEndpoint(url: string): void {
        const normalizedUrl = this.normalizeUrl(url);
        if (this.checkIntervals.has(normalizedUrl)) {
            clearInterval(this.checkIntervals.get(normalizedUrl)!);
            this.checkIntervals.delete(normalizedUrl);
        }
        this.endpoints.delete(normalizedUrl);
        this.healthStatus.delete(normalizedUrl);
        this.healthHistory.delete(normalizedUrl);
        this.log(`Endpoint removed: ${normalizedUrl}`);
        this.healthChangeEmitter.fire();
    }

    /**
     * Set multiple endpoints at once, removing any that aren't in the list.
     */
    setEndpoints(configs: { url: string, priority: number, fallback: boolean }[]): void {
        const newUrls = new Set(configs.map(c => this.normalizeUrl(c.url)));

        // Remove old ones
        for (const url of this.endpoints.keys()) {
            if (!newUrls.has(url)) {
                this.removeEndpoint(url);
            }
        }

        // Add/update new ones
        for (const config of configs) {
            this.addEndpoint(config.url, config.priority, config.fallback);
        }
    }

    /**
     * Start health monitoring for all endpoints.
     */
    startMonitoring(): void {
        for (const [url, config] of this.endpoints) {
            this.startMonitoringForEndpoint(url);
        }
    }

    private startMonitoringForEndpoint(url: string): void {
        if (!this.checkIntervals.has(url)) {
            this.performHealthCheck(url).catch(err => this.log(`Check error: ${err}`));
            const interval = setInterval(() => {
                this.performHealthCheck(url).catch(err => this.log(`Check error: ${err}`));
            }, this.config.checkInterval);
            this.checkIntervals.set(url, interval);
            this.log(`Monitoring started: ${url}`);
        }
    }

    /**
     * Stop health monitoring.
     */
    stopMonitoring(): void {
        for (const [url, interval] of this.checkIntervals) {
            clearInterval(interval);
        }
        this.checkIntervals.clear();
        this.log('Monitoring stopped');
    }

    /**
     * Perform single health check for endpoint.
     */
    async performHealthCheck(endpoint: string, method: string = 'getNetwork'): Promise<HealthCheckResult> {
        const normalizedUrl = this.normalizeUrl(endpoint);
        const startTime = Date.now();

        try {
            const result = await Promise.race([
                this.checkEndpoint(normalizedUrl, method),
                this.createTimeout(this.config.timeout)
            ]);

            const responseTime = Date.now() - startTime;
            return this.updateHealth(normalizedUrl, EndpointHealth.HEALTHY, responseTime, undefined);
        } catch (error) {
            return this.updateHealth(
                normalizedUrl,
                EndpointHealth.UNHEALTHY,
                Date.now() - startTime,
                error instanceof Error ? error.message : String(error)
            );
        }
    }

    /**
     * Get health status of specific endpoint.
     */
    getEndpointHealth(endpoint: string): HealthCheckResult | undefined {
        return this.healthStatus.get(this.normalizeUrl(endpoint));
    }

    /**
     * Get status of best available endpoint.
     */
    getBestEndpoint(): EndpointConfig | undefined {
        const endpoints = Array.from(this.endpoints.values());
        return endpoints
            .filter(ep => this.isEndpointUsable(ep.url))
            .sort((a, b) => a.priority - b.priority)[0];
    }

    /**
     * Get all endpoints sorted by health and priority.
     */
    getEndpointsByHealth(): HealthCheckResult[] {
        return Array.from(this.healthStatus.values())
            .sort((a, b) => {
                const healthOrder = { [EndpointHealth.HEALTHY]: 0, [EndpointHealth.DEGRADED]: 1, [EndpointHealth.UNHEALTHY]: 2, [EndpointHealth.UNKNOWN]: 3 };
                const healthDiff = (healthOrder[a.status] ?? 3) - (healthOrder[b.status] ?? 3);
                if (healthDiff !== 0) return healthDiff;

                const configA = this.endpoints.get(a.endpoint);
                const configB = this.endpoints.get(b.endpoint);
                return (configA?.priority ?? 999) - (configB?.priority ?? 999);
            });
    }

    /**
     * Get health check history for endpoint.
     */
    getHistory(endpoint: string): HealthCheckResult[] {
        return this.healthHistory.get(this.normalizeUrl(endpoint)) ?? [];
    }

    /**
     * Clear health history.
     */
    clearHistory(endpoint?: string): void {
        if (endpoint) {
            const normalized = this.normalizeUrl(endpoint);
            this.healthHistory.set(normalized, []);
            this.log(`History cleared for ${normalized}`);
        } else {
            this.healthHistory.clear();
            this.log('All health history cleared');
        }
    }

    /**
     * Dispose resources.
     */
    dispose(): void {
        this.stopMonitoring();
        this.outputChannel.dispose();
        this.healthChangeEmitter.dispose();
    }

    // ============================================================
    // Private Methods
    // ============================================================

    private async checkEndpoint(url: string, method: string): Promise<void> {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method,
                params: {}
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json() as Record<string, unknown>;
        if ((data as Record<string, unknown>).error) {
            const errorObj = (data as Record<string, unknown>).error as Record<string, unknown>;
            throw new Error(`RPC Error: ${errorObj.message}`);
        }
    }

    private updateHealth(
        endpoint: string,
        status: EndpointHealth,
        responseTime: number,
        error: string | undefined
    ): HealthCheckResult {
        const current = this.healthStatus.get(endpoint) || {
            endpoint,
            status: EndpointHealth.UNKNOWN,
            responseTime: 0,
            timestamp: 0,
            consecutiveFailures: 0
        };

        const result: HealthCheckResult = {
            endpoint,
            status,
            responseTime,
            timestamp: Date.now(),
            error,
            consecutiveFailures: status === EndpointHealth.HEALTHY ? 0 : current.consecutiveFailures + 1
        };

        // Determine final status based on consecutive failures
        if (result.consecutiveFailures >= this.config.failureThreshold) {
            result.status = EndpointHealth.UNHEALTHY;
        } else if (result.consecutiveFailures > 0) {
            result.status = EndpointHealth.DEGRADED;
        }

        this.healthStatus.set(endpoint, result);
        this.addToHistory(endpoint, result);
        this.log(`Health updated: ${endpoint} -> ${result.status} (${responseTime}ms)`);
        this.healthChangeEmitter.fire();

        return result;
    }

    private addToHistory(endpoint: string, result: HealthCheckResult): void {
        const history = this.healthHistory.get(endpoint) ?? [];
        history.push(result);
        if (history.length > this.config.maxHistory) {
            history.shift();
        }
        this.healthHistory.set(endpoint, history);
    }

    private isEndpointUsable(endpoint: string): boolean {
        const status = this.healthStatus.get(endpoint);
        return status?.status !== EndpointHealth.UNHEALTHY;
    }

    private normalizeUrl(url: string): string {
        return url.endsWith('/') ? url.slice(0, -1) : url;
    }

    private createTimeout(ms: number): Promise<never> {
        return new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Health check timeout')), ms)
        );
    }

    private log(message: string): void {
        if (this.config.enableLogging) {
            const timestamp = new Date().toISOString();
            this.outputChannel.appendLine(`[${timestamp}] ${message}`);
        }
    }
}
