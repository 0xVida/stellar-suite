// ============================================================
// src/services/performanceMonitoringService.ts
// Core performance monitoring and metrics collection service
// ============================================================

export interface PerformanceMetric {
    name: string;
    duration: number; // milliseconds
    timestamp: number;
    category: 'render' | 'update' | 'generation' | 'interaction' | 'network';
    metadata?: Record<string, any>;
}

export interface PerformanceBenchmark {
    name: string;
    category: string;
    targetMs: number;
    warningThresholdMs: number;
    criticalThresholdMs: number;
}

export interface PerformanceSnapshot {
    timestamp: number;
    metrics: PerformanceMetric[];
    averages: Record<string, number>;
    percentiles: Record<string, Record<number, number>>; // metric -> { 50: x, 95: y, 99: z }
    slowestOperations: PerformanceMetric[];
}

export interface RegressionAlert {
    metricName: string;
    previousAverage: number;
    currentAverage: number;
    percentageChange: number;
    severity: 'warning' | 'critical';
}

/**
 * Comprehensive performance monitoring service
 * Tracks UI rendering, updates, and interaction performance
 */
export class PerformanceMonitoringService {
    private metrics: PerformanceMetric[] = [];
    private benchmarks: Map<string, PerformanceBenchmark> = new Map();
    private snapshots: PerformanceSnapshot[] = [];
    private readonly maxMetrics = 10000;
    private readonly maxSnapshots = 100;
    private regressionThreshold = 0.15; // 15% increase triggers warning

    constructor() {
        this.initializeDefaultBenchmarks();
    }

    /**
     * Record a performance metric
     */
    recordMetric(
        name: string,
        duration: number,
        category: 'render' | 'update' | 'generation' | 'interaction' | 'network',
        metadata?: Record<string, any>
    ): void {
        const metric: PerformanceMetric = {
            name,
            duration,
            timestamp: Date.now(),
            category,
            metadata,
        };

        this.metrics.push(metric);

        // Keep metrics bounded
        if (this.metrics.length > this.maxMetrics) {
            this.metrics = this.metrics.slice(-this.maxMetrics);
        }
    }

    /**
     * Measure execution time of a function
     */
    async measureAsync<T>(
        name: string,
        category: 'render' | 'update' | 'generation' | 'interaction' | 'network',
        fn: () => Promise<T>,
        metadata?: Record<string, any>
    ): Promise<T> {
        const start = performance.now();
        try {
            const result = await fn();
            const duration = performance.now() - start;
            this.recordMetric(name, duration, category, metadata);
            return result;
        } catch (error) {
            const duration = performance.now() - start;
            this.recordMetric(name, duration, category, { ...metadata, error: true });
            throw error;
        }
    }

    /**
     * Measure execution time of a synchronous function
     */
    measureSync<T>(
        name: string,
        category: 'render' | 'update' | 'generation' | 'interaction' | 'network',
        fn: () => T,
        metadata?: Record<string, any>
    ): T {
        const start = performance.now();
        try {
            const result = fn();
            const duration = performance.now() - start;
            this.recordMetric(name, duration, category, metadata);
            return result;
        } catch (error) {
            const duration = performance.now() - start;
            this.recordMetric(name, duration, category, { ...metadata, error: true });
            throw error;
        }
    }

    /**
     * Get metrics for a specific name
     */
    getMetricsForName(name: string): PerformanceMetric[] {
        return this.metrics.filter(m => m.name === name);
    }

    /**
     * Get metrics for a specific category
     */
    getMetricsForCategory(category: string): PerformanceMetric[] {
        return this.metrics.filter(m => m.category === category);
    }

    /**
     * Calculate statistics for a metric
     */
    calculateStats(metricName: string): {
        count: number;
        average: number;
        min: number;
        max: number;
        p50: number;
        p95: number;
        p99: number;
    } | null {
        const metrics = this.getMetricsForName(metricName);
        if (metrics.length === 0) return null;

        const durations = metrics.map(m => m.duration).sort((a, b) => a - b);
        const sum = durations.reduce((a, b) => a + b, 0);

        return {
            count: durations.length,
            average: sum / durations.length,
            min: durations[0],
            max: durations[durations.length - 1],
            p50: this.percentile(durations, 50),
            p95: this.percentile(durations, 95),
            p99: this.percentile(durations, 99),
        };
    }

    /**
     * Create a performance snapshot
     */
    createSnapshot(): PerformanceSnapshot {
        const metricNames = new Set(this.metrics.map(m => m.name));
        const averages: Record<string, number> = {};
        const percentiles: Record<string, Record<number, number>> = {};
        const slowestOperations = [...this.metrics]
            .sort((a, b) => b.duration - a.duration)
            .slice(0, 10);

        for (const name of metricNames) {
            const stats = this.calculateStats(name);
            if (stats) {
                averages[name] = stats.average;
                percentiles[name] = {
                    50: stats.p50,
                    95: stats.p95,
                    99: stats.p99,
                };
            }
        }

        const snapshot: PerformanceSnapshot = {
            timestamp: Date.now(),
            metrics: [...this.metrics],
            averages,
            percentiles,
            slowestOperations,
        };

        this.snapshots.push(snapshot);
        if (this.snapshots.length > this.maxSnapshots) {
            this.snapshots = this.snapshots.slice(-this.maxSnapshots);
        }

        return snapshot;
    }

    /**
     * Detect performance regressions
     */
    detectRegressions(): RegressionAlert[] {
        if (this.snapshots.length < 2) return [];

        const alerts: RegressionAlert[] = [];
        const previousSnapshot = this.snapshots[this.snapshots.length - 2];
        const currentSnapshot = this.snapshots[this.snapshots.length - 1];

        for (const [metricName, currentAvg] of Object.entries(currentSnapshot.averages)) {
            const previousAvg = previousSnapshot.averages[metricName];
            if (!previousAvg) continue;

            const percentageChange = (currentAvg - previousAvg) / previousAvg;

            if (percentageChange > this.regressionThreshold) {
                const benchmark = this.benchmarks.get(metricName);
                const severity = benchmark && currentAvg > benchmark.criticalThresholdMs
                    ? 'critical'
                    : 'warning';

                alerts.push({
                    metricName,
                    previousAverage: previousAvg,
                    currentAverage: currentAvg,
                    percentageChange,
                    severity,
                });
            }
        }

        return alerts;
    }

    /**
     * Register a performance benchmark
     */
    registerBenchmark(benchmark: PerformanceBenchmark): void {
        this.benchmarks.set(benchmark.name, benchmark);
    }

    /**
     * Get benchmark for a metric
     */
    getBenchmark(metricName: string): PerformanceBenchmark | undefined {
        return this.benchmarks.get(metricName);
    }

    /**
     * Check if metric meets benchmark
     */
    checkBenchmark(metricName: string, duration: number): {
        passed: boolean;
        status: 'ok' | 'warning' | 'critical';
        benchmark?: PerformanceBenchmark;
    } {
        const benchmark = this.benchmarks.get(metricName);
        if (!benchmark) {
            return { passed: true, status: 'ok' };
        }

        if (duration > benchmark.criticalThresholdMs) {
            return { passed: false, status: 'critical', benchmark };
        }

        if (duration > benchmark.warningThresholdMs) {
            return { passed: false, status: 'warning', benchmark };
        }

        return { passed: true, status: 'ok', benchmark };
    }

    /**
     * Clear all metrics
     */
    clearMetrics(): void {
        this.metrics = [];
    }

    /**
     * Clear all snapshots
     */
    clearSnapshots(): void {
        this.snapshots = [];
    }

    /**
     * Get all snapshots
     */
    getSnapshots(): PerformanceSnapshot[] {
        return [...this.snapshots];
    }

    /**
     * Set regression detection threshold
     */
    setRegressionThreshold(percentage: number): void {
        this.regressionThreshold = percentage;
    }

    // ── Private Helpers ───────────────────────────────────────

    private percentile(sorted: number[], p: number): number {
        const index = Math.ceil((p / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)];
    }

    private initializeDefaultBenchmarks(): void {
        // Sidebar rendering benchmarks
        this.registerBenchmark({
            name: 'sidebar-render-initial',
            category: 'render',
            targetMs: 500,
            warningThresholdMs: 750,
            criticalThresholdMs: 1500,
        });

        this.registerBenchmark({
            name: 'sidebar-render-update',
            category: 'render',
            targetMs: 200,
            warningThresholdMs: 350,
            criticalThresholdMs: 750,
        });

        // Form generation benchmarks
        this.registerBenchmark({
            name: 'form-generation',
            category: 'generation',
            targetMs: 100,
            warningThresholdMs: 200,
            criticalThresholdMs: 500,
        });

        // Simulation panel benchmarks
        this.registerBenchmark({
            name: 'simulation-panel-render',
            category: 'render',
            targetMs: 300,
            warningThresholdMs: 500,
            criticalThresholdMs: 1000,
        });

        this.registerBenchmark({
            name: 'simulation-panel-update',
            category: 'update',
            targetMs: 150,
            warningThresholdMs: 300,
            criticalThresholdMs: 750,
        });

        // UI interaction benchmarks
        this.registerBenchmark({
            name: 'ui-interaction-response',
            category: 'interaction',
            targetMs: 100,
            warningThresholdMs: 200,
            criticalThresholdMs: 500,
        });
    }
}
