import * as vscode from 'vscode';

/**
 * Enum for metric event types
 */
export enum MetricEventType {
    REQUEST = 'request',
    SUCCESS = 'success',
    ERROR = 'error',
    TIMEOUT = 'timeout'
}

/**
 * Individual metric record
 */
export interface MetricRecord {
    timestamp: number;
    endpoint: string;
    method: string;
    responseTime: number;
    status: 'success' | 'error' | 'timeout';
    errorMessage?: string;
}

/**
 * Per-endpoint metrics summary
 */
export interface EndpointMetrics {
    endpoint: string;
    totalRequests: number;
    successCount: number;
    errorCount: number;
    timeoutCount: number;
    averageResponseTime: number;
    minResponseTime: number;
    maxResponseTime: number;
    successRate: number;
    errorRate: number;
    lastUpdated: number;
}

/**
 * Global metrics summary
 */
export interface GlobalMetrics {
    totalRequests: number;
    totalSuccesses: number;
    totalErrors: number;
    totalTimeouts: number;
    overallSuccessRate: number;
    overallErrorRate: number;
    overallTimeoutRate: number;
    averageThroughput: number; // requests per second
    averageResponseTime: number;
    peakThroughput: number;
    endpointMetrics: EndpointMetrics[];
}

/**
 * Metrics configuration
 */
export interface MetricsConfig {
    /** Maximum number of metric records to keep in history */
    maxHistorySize?: number;
    /** Enable automatic logging */
    enableLogging?: boolean;
    /** Time window for throughput calculation in seconds */
    throughputWindow?: number;
}

/**
 * Service for collecting and analyzing RPC performance metrics.
 * Tracks response times, success/error rates, throughput, and provides analysis tools.
 */
export class RpcMetricsService {
    private metricsHistory: MetricRecord[] = [];
    private timeSeriesData: Map<string, MetricRecord[]> = new Map();
    private endpointMetrics: Map<string, EndpointMetrics> = new Map();
    private config: Required<MetricsConfig>;
    private metricsEmitter = new vscode.EventEmitter<{ metric: MetricRecord; summary: EndpointMetrics }>();
    private outputChannel: vscode.OutputChannel;
    private lastThroughputCalculation = 0;
    private requestCountAtLastCalculation = 0;

    readonly onMetricRecorded = this.metricsEmitter.event;

    constructor(context: vscode.ExtensionContext, config: MetricsConfig = {}) {
        this.config = {
            maxHistorySize: config.maxHistorySize ?? 1000,
            enableLogging: config.enableLogging ?? false,
            throughputWindow: config.throughputWindow ?? 60
        };

        this.outputChannel = vscode.window.createOutputChannel('RPC Metrics');
        if (this.config.enableLogging) {
            this.outputChannel.appendLine('[RPC Metrics] Service initialized');
        }
    }

    /**
     * Record a new metric from an RPC request
     */
    public recordMetric(
        endpoint: string,
        method: string,
        responseTime: number,
        status: 'success' | 'error' | 'timeout',
        errorMessage?: string
    ): void {
        const metric: MetricRecord = {
            timestamp: Date.now(),
            endpoint,
            method,
            responseTime,
            status,
            errorMessage
        };

        // Add to history with size limit
        this.metricsHistory.push(metric);
        if (this.metricsHistory.length > this.config.maxHistorySize) {
            this.metricsHistory.shift();
        }

        // Add to time series per endpoint
        if (!this.timeSeriesData.has(endpoint)) {
            this.timeSeriesData.set(endpoint, []);
        }
        const series = this.timeSeriesData.get(endpoint)!;
        series.push(metric);
        if (series.length > this.config.maxHistorySize) {
            series.shift();
        }

        // Update endpoint metrics
        this.updateEndpointMetrics(endpoint);

        // Emit event for UI updates
        const endpointMetrics = this.endpointMetrics.get(endpoint)!;
        this.metricsEmitter.fire({ metric, summary: endpointMetrics });

        if (this.config.enableLogging) {
            this.outputChannel.appendLine(
                `[${method}] ${endpoint} - ${responseTime}ms (${status})`
            );
        }
    }

    /**
     * Get metrics for a specific endpoint
     */
    public getEndpointMetrics(endpoint: string): EndpointMetrics | undefined {
        return this.endpointMetrics.get(endpoint);
    }

    /**
     * Get all endpoints metrics
     */
    public getAllEndpointMetrics(): EndpointMetrics[] {
        return Array.from(this.endpointMetrics.values()).sort(
            (a, b) => b.totalRequests - a.totalRequests
        );
    }

    /**
     * Get global metrics summary
     */
    public getGlobalMetrics(): GlobalMetrics {
        const endpointMetrics = this.getAllEndpointMetrics();
        const totalRequests = this.metricsHistory.length;
        const totalSuccesses = this.metricsHistory.filter(m => m.status === 'success').length;
        const totalErrors = this.metricsHistory.filter(m => m.status === 'error').length;
        const totalTimeouts = this.metricsHistory.filter(m => m.status === 'timeout').length;

        const averageResponseTime =
            totalRequests > 0
                ? this.metricsHistory.reduce((sum, m) => sum + m.responseTime, 0) / totalRequests
                : 0;

        const now = Date.now();
        const recentWindow = this.config.throughputWindow * 1000;
        const recentMetrics = this.metricsHistory.filter(m => now - m.timestamp < recentWindow);
        const averageThroughput = recentMetrics.length / this.config.throughputWindow;

        return {
            totalRequests,
            totalSuccesses,
            totalErrors,
            totalTimeouts,
            overallSuccessRate: totalRequests > 0 ? (totalSuccesses / totalRequests) * 100 : 0,
            overallErrorRate: totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0,
            overallTimeoutRate: totalRequests > 0 ? (totalTimeouts / totalRequests) * 100 : 0,
            averageThroughput,
            averageResponseTime,
            peakThroughput: this.calculatePeakThroughput(),
            endpointMetrics
        };
    }

    /**
     * Get metrics for a specific time range
     */
    public getMetricsInTimeRange(startTime: number, endTime: number): MetricRecord[] {
        return this.metricsHistory.filter(m => m.timestamp >= startTime && m.timestamp <= endTime);
    }

    /**
     * Get metrics for a specific endpoint and time range
     */
    public getEndpointMetricsInRange(
        endpoint: string,
        startTime: number,
        endTime: number
    ): MetricRecord[] {
        const series = this.timeSeriesData.get(endpoint) || [];
        return series.filter(m => m.timestamp >= startTime && m.timestamp <= endTime);
    }

    /**
     * Calculate percentile response time
     */
    public getResponseTimePercentile(endpoint: string, percentile: number): number {
        const series = this.timeSeriesData.get(endpoint) || [];
        if (series.length === 0) return 0;

        const sorted = [...series].sort((a, b) => a.responseTime - b.responseTime);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)].responseTime;
    }

    /**
     * Get success rate for endpoint
     */
    public getSuccessRate(endpoint: string): number {
        const metrics = this.endpointMetrics.get(endpoint);
        return metrics ? metrics.successRate : 0;
    }

    /**
     * Get error rate for endpoint
     */
    public getErrorRate(endpoint: string): number {
        const metrics = this.endpointMetrics.get(endpoint);
        return metrics ? metrics.errorRate : 0;
    }

    /**
     * Get throughput for endpoint in requests per second
     */
    public getThroughput(endpoint: string, window: number = 60): number {
        const now = Date.now();
        const series = this.timeSeriesData.get(endpoint) || [];
        const recentCount = series.filter(m => now - m.timestamp < window * 1000).length;
        return recentCount / window;
    }

    /**
     * Get detailed metrics for analysis
     */
    public getDetailedAnalysis(endpoint: string): {
        responseTimeStats: {
            min: number;
            max: number;
            avg: number;
            p50: number;
            p95: number;
            p99: number;
        };
        errorAnalysis: {
            byType: Map<string, number>;
            recentErrors: MetricRecord[];
        };
        trending: {
            improving: boolean;
            improvementPercent: number;
        };
    } {
        const series = this.timeSeriesData.get(endpoint) || [];

        // Response time stats
        const responseTimes = series.map(m => m.responseTime).sort((a, b) => a - b);
        const responseTimeStats = {
            min: responseTimes[0] || 0,
            max: responseTimes[responseTimes.length - 1] || 0,
            avg: responseTimes.length > 0 ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0,
            p50: responseTimes[Math.floor(responseTimes.length * 0.5)] || 0,
            p95: responseTimes[Math.floor(responseTimes.length * 0.95)] || 0,
            p99: responseTimes[Math.floor(responseTimes.length * 0.99)] || 0
        };

        // Error analysis
        const errorsByType = new Map<string, number>();
        const recentErrors = series.filter(m => m.status !== 'success').slice(-10);
        recentErrors.forEach(m => {
            const type = m.errorMessage || m.status;
            errorsByType.set(type, (errorsByType.get(type) || 0) + 1);
        });

        // Trending
        const midpoint = Math.floor(series.length / 2);
        const firstHalf = series.slice(0, midpoint).map(m => m.responseTime);
        const secondHalf = series.slice(midpoint).map(m => m.responseTime);
        const firstHalfAvg = firstHalf.length > 0 ? firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length : 0;
        const secondHalfAvg = secondHalf.length > 0 ? secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length : 0;
        const improvementPercent = firstHalfAvg > 0 ? ((firstHalfAvg - secondHalfAvg) / firstHalfAvg) * 100 : 0;

        return {
            responseTimeStats,
            errorAnalysis: {
                byType: errorsByType,
                recentErrors
            },
            trending: {
                improving: improvementPercent > 0,
                improvementPercent: Math.abs(improvementPercent)
            }
        };
    }

    /**
     * Clear all metrics
     */
    public clearMetrics(): void {
        this.metricsHistory = [];
        this.timeSeriesData.clear();
        this.endpointMetrics.clear();
        if (this.config.enableLogging) {
            this.outputChannel.appendLine('[RPC Metrics] Metrics cleared');
        }
    }

    /**
     * Clear metrics for specific endpoint
     */
    public clearEndpointMetrics(endpoint: string): void {
        this.timeSeriesData.delete(endpoint);
        this.endpointMetrics.delete(endpoint);
        this.metricsHistory = this.metricsHistory.filter(m => m.endpoint !== endpoint);
        if (this.config.enableLogging) {
            this.outputChannel.appendLine(`[RPC Metrics] Metrics cleared for ${endpoint}`);
        }
    }

    /**
     * Export metrics as JSON
     */
    public exportMetricsAsJson(): string {
        return JSON.stringify(
            {
                exportedAt: new Date().toISOString(),
                globalMetrics: this.getGlobalMetrics(),
                history: this.metricsHistory
            },
            null,
            2
        );
    }

    /**
     * Export metrics as CSV
     */
    public exportMetricsAsCsv(): string {
        const headers = ['Timestamp', 'Endpoint', 'Method', 'Response Time (ms)', 'Status', 'Error Message'];
        const rows = this.metricsHistory.map(m => [
            new Date(m.timestamp).toISOString(),
            m.endpoint,
            m.method,
            m.responseTime.toString(),
            m.status,
            m.errorMessage || ''
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        return csvContent;
    }

    /**
     * Dispose of resources
     */
    public dispose(): void {
        this.metricsEmitter.dispose();
        this.outputChannel.dispose();
    }

    // ============================================================
    // Private Methods
    // ============================================================

    private updateEndpointMetrics(endpoint: string): void {
        const series = this.timeSeriesData.get(endpoint) || [];
        const successCount = series.filter(m => m.status === 'success').length;
        const errorCount = series.filter(m => m.status === 'error').length;
        const timeoutCount = series.filter(m => m.status === 'timeout').length;
        const totalRequests = series.length;

        const responseTimes = series.map(m => m.responseTime);
        const averageResponseTime =
            responseTimes.length > 0 ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0;

        const metrics: EndpointMetrics = {
            endpoint,
            totalRequests,
            successCount,
            errorCount,
            timeoutCount,
            averageResponseTime,
            minResponseTime: Math.min(...responseTimes, Infinity),
            maxResponseTime: Math.max(...responseTimes, -Infinity),
            successRate: totalRequests > 0 ? (successCount / totalRequests) * 100 : 0,
            errorRate: totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0,
            lastUpdated: Date.now()
        };

        this.endpointMetrics.set(endpoint, metrics);
    }

    private calculatePeakThroughput(): number {
        const bucketSize = 10000; // 10 second buckets
        const buckets = new Map<number, number>();

        this.metricsHistory.forEach(m => {
            const bucket = Math.floor(m.timestamp / bucketSize);
            buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
        });

        if (buckets.size === 0) return 0;
        const maxBucket = Math.max(...Array.from(buckets.values()));
        return (maxBucket / (bucketSize / 1000)); // Convert to requests per second
    }
}
