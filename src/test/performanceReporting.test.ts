// ============================================================
// src/test/performanceReporting.test.ts
// Tests for performance report generation and export
// ============================================================

declare function require(name: string): any;
declare const process: { exitCode?: number };

const assert = require('assert');

import { PerformanceMonitoringService } from '../services/performanceMonitoringService';
import { PerformanceReportService } from '../services/performanceReportService';

// ── Test Fixtures ─────────────────────────────────────────

function createTestSnapshot() {
    const monitor = new PerformanceMonitoringService();

    // Record various metrics
    for (let i = 0; i < 20; i++) {
        monitor.recordMetric('sidebar-render-initial', 400 + Math.random() * 100, 'render', { contractCount: 50 });
        monitor.recordMetric('form-generation', 100 + Math.random() * 50, 'generation', { paramCount: 10 });
        monitor.recordMetric('ui-interaction-response', 20 + Math.random() * 10, 'interaction');
        monitor.recordMetric('simulation-panel-render', 250 + Math.random() * 100, 'render');
    }

    return monitor.createSnapshot();
}

// ── Report Generation ─────────────────────────────────────

async function testReportGeneration() {
    const reportService = new PerformanceReportService();
    const snapshot = createTestSnapshot();

    const report = reportService.generateReport(snapshot, [], 'Test Performance Report');

    assert.ok(report);
    assert.strictEqual(report.title, 'Test Performance Report');
    assert.ok(report.timestamp > 0);
    assert.ok(report.summary.totalMetrics > 0);
    assert.ok(report.summary.totalDuration > 0);
    assert.ok(report.summary.averageMetricDuration > 0);
    assert.ok(report.summary.slowestMetric.name);
    assert.ok(report.summary.fastestMetric.name);
    console.log('  [ok] report generation creates valid report structure');
}

async function testReportCategoryStats() {
    const reportService = new PerformanceReportService();
    const snapshot = createTestSnapshot();

    const report = reportService.generateReport(snapshot);

    assert.ok(report.byCategory['render']);
    assert.ok(report.byCategory['generation']);
    assert.ok(report.byCategory['interaction']);

    const renderStats = report.byCategory['render'];
    assert.ok(renderStats.count > 0);
    assert.ok(renderStats.average > 0);
    assert.ok(renderStats.min > 0);
    assert.ok(renderStats.max >= renderStats.min);
    assert.ok(renderStats.p95 >= renderStats.average);
    assert.ok(renderStats.p99 >= renderStats.p95);
    console.log('  [ok] category statistics calculated correctly');
}

async function testReportSlowestOperations() {
    const reportService = new PerformanceReportService();
    const snapshot = createTestSnapshot();

    const report = reportService.generateReport(snapshot);

    assert.ok(report.slowestOperations.length > 0);
    assert.ok(report.slowestOperations.length <= 10);

    // Verify sorted by duration
    for (let i = 0; i < report.slowestOperations.length - 1; i++) {
        assert.ok(
            report.slowestOperations[i].duration >= report.slowestOperations[i + 1].duration,
            'Slowest operations should be sorted by duration'
        );
    }
    console.log('  [ok] slowest operations identified and sorted');
}

async function testReportWithRegressions() {
    const reportService = new PerformanceReportService();
    const snapshot = createTestSnapshot();

    const regressions = [
        {
            metricName: 'sidebar-render-initial',
            previousAverage: 400,
            currentAverage: 600,
            percentageChange: 0.5,
            severity: 'warning' as const,
        },
        {
            metricName: 'form-generation',
            previousAverage: 100,
            currentAverage: 250,
            percentageChange: 1.5,
            severity: 'critical' as const,
        },
    ];

    const report = reportService.generateReport(snapshot, regressions);

    assert.strictEqual(report.regressions.length, 2);
    assert.strictEqual(report.regressions[0].severity, 'warning');
    assert.strictEqual(report.regressions[1].severity, 'critical');
    console.log('  [ok] regressions included in report');
}

async function testReportRecommendations() {
    const reportService = new PerformanceReportService();
    const snapshot = createTestSnapshot();

    const report = reportService.generateReport(snapshot);

    assert.ok(report.recommendations);
    assert.ok(Array.isArray(report.recommendations));
    assert.ok(report.recommendations.length > 0);
    console.log(`  [ok] recommendations generated: ${report.recommendations.length} items`);
}

// ── JSON Export ───────────────────────────────────────────

async function testExportAsJson() {
    const reportService = new PerformanceReportService();
    const snapshot = createTestSnapshot();
    const report = reportService.generateReport(snapshot);

    const json = reportService.exportAsJson(report);

    assert.ok(json);
    assert.ok(typeof json === 'string');
    assert.ok(json.includes(report.title));

    // Verify it's valid JSON
    const parsed = JSON.parse(json);
    assert.strictEqual(parsed.title, report.title);
    assert.strictEqual(parsed.summary.totalMetrics, report.summary.totalMetrics);
    console.log('  [ok] JSON export produces valid JSON');
}

// ── CSV Export ────────────────────────────────────────────

async function testExportAsCsv() {
    const reportService = new PerformanceReportService();
    const snapshot = createTestSnapshot();
    const report = reportService.generateReport(snapshot);

    const csv = reportService.exportAsCsv(report);

    assert.ok(csv);
    assert.ok(typeof csv === 'string');
    assert.ok(csv.includes('Performance Report'));
    assert.ok(csv.includes('Summary'));
    assert.ok(csv.includes('Performance by Category'));
    assert.ok(csv.includes('Total Metrics'));

    // Verify CSV structure
    const lines = csv.split('\n');
    assert.ok(lines.length > 10);
    console.log('  [ok] CSV export produces valid CSV format');
}

async function testCsvContainsMetrics() {
    const reportService = new PerformanceReportService();
    const snapshot = createTestSnapshot();
    const report = reportService.generateReport(snapshot);

    const csv = reportService.exportAsCsv(report);

    // Check for category data
    assert.ok(csv.includes('render'));
    assert.ok(csv.includes('generation'));
    assert.ok(csv.includes('interaction'));
    console.log('  [ok] CSV export includes all metric categories');
}

// ── HTML Export ───────────────────────────────────────────

async function testExportAsHtml() {
    const reportService = new PerformanceReportService();
    const snapshot = createTestSnapshot();
    const report = reportService.generateReport(snapshot);

    const html = reportService.exportAsHtml(report);

    assert.ok(html);
    assert.ok(typeof html === 'string');
    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes(report.title));
    assert.ok(html.includes('<table>'));
    assert.ok(html.includes('</html>'));
    console.log('  [ok] HTML export produces valid HTML');
}

async function testHtmlContainsAllSections() {
    const reportService = new PerformanceReportService();
    const snapshot = createTestSnapshot();
    const regressions = [
        {
            metricName: 'test-metric',
            previousAverage: 100,
            currentAverage: 200,
            percentageChange: 1,
            severity: 'critical' as const,
        },
    ];
    const report = reportService.generateReport(snapshot, regressions);

    const html = reportService.exportAsHtml(report);

    assert.ok(html.includes('Summary'));
    assert.ok(html.includes('Performance by Category'));
    assert.ok(html.includes('Slowest Operations'));
    assert.ok(html.includes('Performance Regressions'));
    assert.ok(html.includes('Recommendations'));
    console.log('  [ok] HTML export includes all report sections');
}

// ── Markdown Export ───────────────────────────────────────

async function testExportAsMarkdown() {
    const reportService = new PerformanceReportService();
    const snapshot = createTestSnapshot();
    const report = reportService.generateReport(snapshot);

    const markdown = reportService.exportAsMarkdown(report);

    assert.ok(markdown);
    assert.ok(typeof markdown === 'string');
    assert.ok(markdown.includes(`# ${report.title}`));
    assert.ok(markdown.includes('## Summary'));
    assert.ok(markdown.includes('## Performance by Category'));
    console.log('  [ok] Markdown export produces valid Markdown');
}

async function testMarkdownContainsMetrics() {
    const reportService = new PerformanceReportService();
    const snapshot = createTestSnapshot();
    const report = reportService.generateReport(snapshot);

    const markdown = reportService.exportAsMarkdown(report);

    // Check for metric data
    assert.ok(markdown.includes('Total Metrics'));
    assert.ok(markdown.includes('Average Duration'));
    assert.ok(markdown.includes('render'));
    console.log('  [ok] Markdown export includes metric data');
}

async function testMarkdownWithRegressions() {
    const reportService = new PerformanceReportService();
    const snapshot = createTestSnapshot();
    const regressions = [
        {
            metricName: 'test-metric',
            previousAverage: 100,
            currentAverage: 200,
            percentageChange: 1,
            severity: 'critical' as const,
        },
    ];
    const report = reportService.generateReport(snapshot, regressions);

    const markdown = reportService.exportAsMarkdown(report);

    assert.ok(markdown.includes('Performance Regressions'));
    assert.ok(markdown.includes('test-metric'));
    assert.ok(markdown.includes('critical'));
    console.log('  [ok] Markdown export includes regression data');
}

// ── Empty Report Handling ─────────────────────────────────

async function testEmptyReportGeneration() {
    const reportService = new PerformanceReportService();
    const monitor = new PerformanceMonitoringService();
    const snapshot = monitor.createSnapshot(); // Empty snapshot

    const report = reportService.generateReport(snapshot);

    assert.ok(report);
    assert.strictEqual(report.summary.totalMetrics, 0);
    assert.ok(report.recommendations.includes('No metrics recorded'));
    console.log('  [ok] empty report handled gracefully');
}

async function testEmptyReportExports() {
    const reportService = new PerformanceReportService();
    const monitor = new PerformanceMonitoringService();
    const snapshot = monitor.createSnapshot();
    const report = reportService.generateReport(snapshot);

    const json = reportService.exportAsJson(report);
    const csv = reportService.exportAsCsv(report);
    const html = reportService.exportAsHtml(report);
    const markdown = reportService.exportAsMarkdown(report);

    assert.ok(json);
    assert.ok(csv);
    assert.ok(html);
    assert.ok(markdown);
    console.log('  [ok] empty report exports to all formats');
}

// ── Report Consistency ────────────────────────────────────

async function testReportConsistency() {
    const reportService = new PerformanceReportService();
    const snapshot = createTestSnapshot();

    const report1 = reportService.generateReport(snapshot);
    const report2 = reportService.generateReport(snapshot);

    // Same snapshot should produce same report
    assert.strictEqual(report1.summary.totalMetrics, report2.summary.totalMetrics);
    assert.strictEqual(report1.summary.totalDuration, report2.summary.totalDuration);
    assert.strictEqual(report1.summary.averageMetricDuration, report2.summary.averageMetricDuration);
    console.log('  [ok] same snapshot produces consistent reports');
}

// ── Runner ────────────────────────────────────────────────

async function run() {
    const tests: Array<() => Promise<void>> = [
        // Report generation
        testReportGeneration,
        testReportCategoryStats,
        testReportSlowestOperations,
        testReportWithRegressions,
        testReportRecommendations,
        // JSON export
        testExportAsJson,
        // CSV export
        testExportAsCsv,
        testCsvContainsMetrics,
        // HTML export
        testExportAsHtml,
        testHtmlContainsAllSections,
        // Markdown export
        testExportAsMarkdown,
        testMarkdownContainsMetrics,
        testMarkdownWithRegressions,
        // Empty report
        testEmptyReportGeneration,
        testEmptyReportExports,
        // Consistency
        testReportConsistency,
    ];

    let passed = 0;
    let failed = 0;

    console.log('\nPerformance Reporting Tests');
    for (const test of tests) {
        try {
            await test();
            passed += 1;
        } catch (error) {
            failed += 1;
            console.error(`  [fail] ${test.name}`);
            console.error(`         ${error instanceof Error ? error.stack || error.message : String(error)}`);
        }
    }

    console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);

    if (failed > 0) {
        process.exitCode = 1;
    }
}

run().catch(error => {
    console.error('Test runner error:', error);
    process.exitCode = 1;
});
