// ============================================================
// src/services/performanceReportService.ts
// Generates performance reports and exports metrics
// ============================================================

import { PerformanceMetric, PerformanceSnapshot, RegressionAlert } from './performanceMonitoringService';

export interface PerformanceReport {
    timestamp: number;
    title: string;
    summary: {
        totalMetrics: number;
        totalDuration: number;
        averageMetricDuration: number;
        slowestMetric: { name: string; duration: number };
        fastestMetric: { name: string; duration: number };
    };
    byCategory: Record<string, {
        count: number;
        average: number;
        min: number;
        max: number;
        p95: number;
        p99: number;
    }>;
    slowestOperations: Array<{
        name: string;
        duration: number;
        category: string;
        timestamp: number;
    }>;
    regressions: RegressionAlert[];
    recommendations: string[];
}

/**
 * Generates performance reports and exports metrics
 */
export class PerformanceReportService {
    /**
     * Generate a performance report from a snapshot
     */
    generateReport(
        snapshot: PerformanceSnapshot,
        regressions: RegressionAlert[] = [],
        title: string = 'Performance Report'
    ): PerformanceReport {
        const metrics = snapshot.metrics;

        if (metrics.length === 0) {
            return this.createEmptyReport(title);
        }

        const durations = metrics.map(m => m.duration);
        const totalDuration = durations.reduce((a, b) => a + b, 0);
        const averageDuration = totalDuration / metrics.length;

        // Group by category
        const byCategory: Record<string, PerformanceMetric[]> = {};
        for (const metric of metrics) {
            if (!byCategory[metric.category]) {
                byCategory[metric.category] = [];
            }
            byCategory[metric.category].push(metric);
        }

        // Calculate category stats
        const categoryStats: Record<string, any> = {};
        for (const [category, categoryMetrics] of Object.entries(byCategory)) {
            const categoryDurations = categoryMetrics.map(m => m.duration).sort((a, b) => a - b);
            categoryStats[category] = {
                count: categoryMetrics.length,
                average: categoryDurations.reduce((a, b) => a + b, 0) / categoryMetrics.length,
                min: categoryDurations[0],
                max: categoryDurations[categoryDurations.length - 1],
                p95: this.percentile(categoryDurations, 95),
                p99: this.percentile(categoryDurations, 99),
            };
        }

        // Find slowest and fastest
        const sorted = [...metrics].sort((a, b) => b.duration - a.duration);
        const slowestMetric = sorted[0];
        const fastestMetric = sorted[sorted.length - 1];

        // Generate recommendations
        const recommendations = this.generateRecommendations(categoryStats, regressions);

        return {
            timestamp: snapshot.timestamp,
            title,
            summary: {
                totalMetrics: metrics.length,
                totalDuration,
                averageMetricDuration: averageDuration,
                slowestMetric: {
                    name: slowestMetric.name,
                    duration: slowestMetric.duration,
                },
                fastestMetric: {
                    name: fastestMetric.name,
                    duration: fastestMetric.duration,
                },
            },
            byCategory: categoryStats,
            slowestOperations: snapshot.slowestOperations.map(m => ({
                name: m.name,
                duration: m.duration,
                category: m.category,
                timestamp: m.timestamp,
            })),
            regressions,
            recommendations,
        };
    }

    /**
     * Export report as JSON
     */
    exportAsJson(report: PerformanceReport): string {
        return JSON.stringify(report, null, 2);
    }

    /**
     * Export report as CSV
     */
    exportAsCsv(report: PerformanceReport): string {
        const lines: string[] = [];

        // Header
        lines.push('Performance Report');
        lines.push(`Generated: ${new Date(report.timestamp).toISOString()}`);
        lines.push('');

        // Summary
        lines.push('Summary');
        lines.push(`Total Metrics,${report.summary.totalMetrics}`);
        lines.push(`Total Duration (ms),${report.summary.totalDuration.toFixed(2)}`);
        lines.push(`Average Duration (ms),${report.summary.averageMetricDuration.toFixed(2)}`);
        lines.push(`Slowest Operation,${report.summary.slowestMetric.name},${report.summary.slowestMetric.duration.toFixed(2)}`);
        lines.push(`Fastest Operation,${report.summary.fastestMetric.name},${report.summary.fastestMetric.duration.toFixed(2)}`);
        lines.push('');

        // By Category
        lines.push('Performance by Category');
        lines.push('Category,Count,Average (ms),Min (ms),Max (ms),P95 (ms),P99 (ms)');
        for (const [category, stats] of Object.entries(report.byCategory)) {
            lines.push(
                `${category},${stats.count},${stats.average.toFixed(2)},${stats.min.toFixed(2)},${stats.max.toFixed(2)},${stats.p95.toFixed(2)},${stats.p99.toFixed(2)}`
            );
        }
        lines.push('');

        // Slowest Operations
        if (report.slowestOperations.length > 0) {
            lines.push('Slowest Operations');
            lines.push('Name,Duration (ms),Category,Timestamp');
            for (const op of report.slowestOperations) {
                lines.push(
                    `${op.name},${op.duration.toFixed(2)},${op.category},${new Date(op.timestamp).toISOString()}`
                );
            }
            lines.push('');
        }

        // Regressions
        if (report.regressions.length > 0) {
            lines.push('Performance Regressions');
            lines.push('Metric,Previous Avg (ms),Current Avg (ms),Change (%),Severity');
            for (const regression of report.regressions) {
                lines.push(
                    `${regression.metricName},${regression.previousAverage.toFixed(2)},${regression.currentAverage.toFixed(2)},${(regression.percentageChange * 100).toFixed(2)},${regression.severity}`
                );
            }
            lines.push('');
        }

        // Recommendations
        if (report.recommendations.length > 0) {
            lines.push('Recommendations');
            for (const rec of report.recommendations) {
                lines.push(`- ${rec}`);
            }
        }

        return lines.join('\n');
    }

    /**
     * Export report as HTML
     */
    exportAsHtml(report: PerformanceReport): string {
        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${report.title}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 20px; }
        h1 { color: #333; }
        h2 { color: #666; margin-top: 30px; border-bottom: 2px solid #007acc; padding-bottom: 10px; }
        table { border-collapse: collapse; width: 100%; margin: 15px 0; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background-color: #007acc; color: white; }
        tr:nth-child(even) { background-color: #f5f5f5; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; margin: 15px 0; }
        .summary-card { background: #f0f0f0; padding: 15px; border-radius: 5px; }
        .summary-card strong { display: block; color: #007acc; }
        .regression { background-color: #ffe6e6; }
        .warning { background-color: #fff3cd; }
        .ok { background-color: #d4edda; }
        .recommendation { background: #e7f3ff; padding: 10px; margin: 5px 0; border-left: 4px solid #007acc; }
        .timestamp { color: #999; font-size: 0.9em; }
    </style>
</head>
<body>
    <h1>${report.title}</h1>
    <p class="timestamp">Generated: ${new Date(report.timestamp).toISOString()}</p>

    <h2>Summary</h2>
    <div class="summary-grid">
        <div class="summary-card">
            <strong>Total Metrics</strong>
            ${report.summary.totalMetrics}
        </div>
        <div class="summary-card">
            <strong>Total Duration</strong>
            ${report.summary.totalDuration.toFixed(2)} ms
        </div>
        <div class="summary-card">
            <strong>Average Duration</strong>
            ${report.summary.averageMetricDuration.toFixed(2)} ms
        </div>
        <div class="summary-card">
            <strong>Slowest Operation</strong>
            ${report.summary.slowestMetric.name} (${report.summary.slowestMetric.duration.toFixed(2)} ms)
        </div>
    </div>

    <h2>Performance by Category</h2>
    <table>
        <thead>
            <tr>
                <th>Category</th>
                <th>Count</th>
                <th>Average (ms)</th>
                <th>Min (ms)</th>
                <th>Max (ms)</th>
                <th>P95 (ms)</th>
                <th>P99 (ms)</th>
            </tr>
        </thead>
        <tbody>
            ${Object.entries(report.byCategory)
                .map(([category, stats]) => `
            <tr>
                <td>${category}</td>
                <td>${stats.count}</td>
                <td>${stats.average.toFixed(2)}</td>
                <td>${stats.min.toFixed(2)}</td>
                <td>${stats.max.toFixed(2)}</td>
                <td>${stats.p95.toFixed(2)}</td>
                <td>${stats.p99.toFixed(2)}</td>
            </tr>
            `)
                .join('')}
        </tbody>
    </table>

    ${report.slowestOperations.length > 0 ? `
    <h2>Slowest Operations</h2>
    <table>
        <thead>
            <tr>
                <th>Name</th>
                <th>Duration (ms)</th>
                <th>Category</th>
                <th>Timestamp</th>
            </tr>
        </thead>
        <tbody>
            ${report.slowestOperations
                .map(op => `
            <tr>
                <td>${op.name}</td>
                <td>${op.duration.toFixed(2)}</td>
                <td>${op.category}</td>
                <td>${new Date(op.timestamp).toISOString()}</td>
            </tr>
            `)
                .join('')}
        </tbody>
    </table>
    ` : ''}

    ${report.regressions.length > 0 ? `
    <h2>Performance Regressions</h2>
    <table>
        <thead>
            <tr>
                <th>Metric</th>
                <th>Previous Avg (ms)</th>
                <th>Current Avg (ms)</th>
                <th>Change (%)</th>
                <th>Severity</th>
            </tr>
        </thead>
        <tbody>
            ${report.regressions
                .map(r => `
            <tr class="${r.severity === 'critical' ? 'regression' : 'warning'}">
                <td>${r.metricName}</td>
                <td>${r.previousAverage.toFixed(2)}</td>
                <td>${r.currentAverage.toFixed(2)}</td>
                <td>${(r.percentageChange * 100).toFixed(2)}</td>
                <td>${r.severity}</td>
            </tr>
            `)
                .join('')}
        </tbody>
    </table>
    ` : ''}

    ${report.recommendations.length > 0 ? `
    <h2>Recommendations</h2>
    <div>
        ${report.recommendations.map(rec => `<div class="recommendation">${rec}</div>`).join('')}
    </div>
    ` : ''}
</body>
</html>
        `;
        return html;
    }

    /**
     * Export report as Markdown
     */
    exportAsMarkdown(report: PerformanceReport): string {
        const lines: string[] = [];

        lines.push(`# ${report.title}`);
        lines.push(`**Generated:** ${new Date(report.timestamp).toISOString()}`);
        lines.push('');

        // Summary
        lines.push('## Summary');
        lines.push(`- **Total Metrics:** ${report.summary.totalMetrics}`);
        lines.push(`- **Total Duration:** ${report.summary.totalDuration.toFixed(2)} ms`);
        lines.push(`- **Average Duration:** ${report.summary.averageMetricDuration.toFixed(2)} ms`);
        lines.push(`- **Slowest Operation:** ${report.summary.slowestMetric.name} (${report.summary.slowestMetric.duration.toFixed(2)} ms)`);
        lines.push(`- **Fastest Operation:** ${report.summary.fastestMetric.name} (${report.summary.fastestMetric.duration.toFixed(2)} ms)`);
        lines.push('');

        // By Category
        lines.push('## Performance by Category');
        lines.push('| Category | Count | Average (ms) | Min (ms) | Max (ms) | P95 (ms) | P99 (ms) |');
        lines.push('|----------|-------|--------------|----------|----------|----------|----------|');
        for (const [category, stats] of Object.entries(report.byCategory)) {
            lines.push(
                `| ${category} | ${stats.count} | ${stats.average.toFixed(2)} | ${stats.min.toFixed(2)} | ${stats.max.toFixed(2)} | ${stats.p95.toFixed(2)} | ${stats.p99.toFixed(2)} |`
            );
        }
        lines.push('');

        // Slowest Operations
        if (report.slowestOperations.length > 0) {
            lines.push('## Slowest Operations');
            lines.push('| Name | Duration (ms) | Category |');
            lines.push('|------|---------------|----------|');
            for (const op of report.slowestOperations.slice(0, 10)) {
                lines.push(`| ${op.name} | ${op.duration.toFixed(2)} | ${op.category} |`);
            }
            lines.push('');
        }

        // Regressions
        if (report.regressions.length > 0) {
            lines.push('## Performance Regressions ⚠️');
            lines.push('| Metric | Previous (ms) | Current (ms) | Change (%) | Severity |');
            lines.push('|--------|---------------|--------------|------------|----------|');
            for (const r of report.regressions) {
                lines.push(
                    `| ${r.metricName} | ${r.previousAverage.toFixed(2)} | ${r.currentAverage.toFixed(2)} | ${(r.percentageChange * 100).toFixed(2)} | ${r.severity} |`
                );
            }
            lines.push('');
        }

        // Recommendations
        if (report.recommendations.length > 0) {
            lines.push('## Recommendations');
            for (const rec of report.recommendations) {
                lines.push(`- ${rec}`);
            }
            lines.push('');
        }

        return lines.join('\n');
    }

    // ── Private Helpers ───────────────────────────────────────

    private percentile(sorted: number[], p: number): number {
        const index = Math.ceil((p / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)];
    }

    private createEmptyReport(title: string): PerformanceReport {
        return {
            timestamp: Date.now(),
            title,
            summary: {
                totalMetrics: 0,
                totalDuration: 0,
                averageMetricDuration: 0,
                slowestMetric: { name: 'N/A', duration: 0 },
                fastestMetric: { name: 'N/A', duration: 0 },
            },
            byCategory: {},
            slowestOperations: [],
            regressions: [],
            recommendations: ['No metrics recorded'],
        };
    }

    private generateRecommendations(
        categoryStats: Record<string, any>,
        regressions: RegressionAlert[]
    ): string[] {
        const recommendations: string[] = [];

        // Check for slow categories
        if (categoryStats['render']?.average > 500) {
            recommendations.push('Rendering performance is degraded. Consider optimizing component rendering or using virtualization for large lists.');
        }

        if (categoryStats['generation']?.average > 200) {
            recommendations.push('Form/content generation is slow. Consider caching or lazy loading.');
        }

        if (categoryStats['update']?.average > 300) {
            recommendations.push('UI updates are slow. Consider batching updates or using memoization.');
        }

        // Check for regressions
        if (regressions.length > 0) {
            const criticalRegressions = regressions.filter(r => r.severity === 'critical');
            if (criticalRegressions.length > 0) {
                recommendations.push(`Critical performance regressions detected in: ${criticalRegressions.map(r => r.metricName).join(', ')}`);
            }
        }

        // Check for high variance
        for (const [category, stats] of Object.entries(categoryStats)) {
            const variance = (stats.p99 - stats.average) / stats.average;
            if (variance > 1) {
                recommendations.push(`High variance in ${category} operations. Investigate outliers and optimize worst-case scenarios.`);
            }
        }

        if (recommendations.length === 0) {
            recommendations.push('Performance is within acceptable ranges.');
        }

        return recommendations;
    }
}
