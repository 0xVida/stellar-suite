import * as vscode from 'vscode';
import { RpcMetricsService } from '../services/rpcMetricsService';
import { MetricsPanel } from '../ui/metricsPanel';

/**
 * Register metrics-related commands
 */
export function registerMetricsCommands(
    context: vscode.ExtensionContext,
    metricsService: RpcMetricsService,
    extensionUri: vscode.Uri
): void {
    let metricsPanel: MetricsPanel | undefined;

    // Command: Show metrics dashboard
    const showMetricsCommand = vscode.commands.registerCommand('stellarSuite.showMetrics', async () => {
        if (!metricsPanel) {
            metricsPanel = new MetricsPanel(metricsService, extensionUri);
        }
        await metricsPanel.show();
    });

    // Command: View metrics summary
    const viewMetricsSummaryCommand = vscode.commands.registerCommand(
        'stellarSuite.viewMetricsSummary',
        async () => {
            const metrics = metricsService.getGlobalMetrics();
            const summary = `
📊 RPC Performance Metrics Summary
==================================

**Global Metrics**
- Total Requests: ${metrics.totalRequests}
- Successful: ${metrics.totalSuccesses} (${metrics.overallSuccessRate.toFixed(2)}%)
- Errors: ${metrics.totalErrors} (${metrics.overallErrorRate.toFixed(2)}%)
- Timeouts: ${metrics.totalTimeouts} (${metrics.overallTimeoutRate.toFixed(2)}%)
- Average Response Time: ${metrics.averageResponseTime.toFixed(2)}ms
- Throughput: ${metrics.averageThroughput.toFixed(2)} req/s
- Peak Throughput: ${metrics.peakThroughput.toFixed(2)} req/s

**Per-Endpoint Breakdown**
${metrics.endpointMetrics
    .map(
        m => `
- ${m.endpoint}
  - Total: ${m.totalRequests}
  - Avg Time: ${m.averageResponseTime.toFixed(2)}ms (min: ${m.minResponseTime}ms, max: ${m.maxResponseTime}ms)
  - Success Rate: ${m.successRate.toFixed(2)}%
  - Error Rate: ${m.errorRate.toFixed(2)}%`
    )
    .join('\n')}
`;
            await vscode.window.showInformationMessage(summary, { modal: true });
        }
    );

    // Command: View endpoint analysis
    const viewEndpointAnalysisCommand = vscode.commands.registerCommand(
        'stellarSuite.viewEndpointAnalysis',
        async () => {
            const metrics = metricsService.getAllEndpointMetrics();
            if (metrics.length === 0) {
                vscode.window.showWarningMessage('No metrics collected yet');
                return;
            }

            const endpoints = metrics.map(m => m.endpoint);
            const selected = await vscode.window.showQuickPick(endpoints, {
                placeHolder: 'Select endpoint to analyze'
            });

            if (!selected) return;

            const analysis = metricsService.getDetailedAnalysis(selected);
            const analysisText = `
📈 Detailed Analysis for ${selected}
${'='.repeat(50)}

**Response Time Statistics**
- Minimum: ${analysis.responseTimeStats.min.toFixed(2)}ms
- Maximum: ${analysis.responseTimeStats.max.toFixed(2)}ms
- Average: ${analysis.responseTimeStats.avg.toFixed(2)}ms
- Median (P50): ${analysis.responseTimeStats.p50.toFixed(2)}ms
- 95th Percentile: ${analysis.responseTimeStats.p95.toFixed(2)}ms
- 99th Percentile: ${analysis.responseTimeStats.p99.toFixed(2)}ms

**Error Analysis**
${
    analysis.errorAnalysis.byType.size > 0
        ? Array.from(analysis.errorAnalysis.byType.entries())
              .map(([type, count]) => `- ${type}: ${count}`)
              .join('\n')
        : '- No errors recorded'
}

**Trend Analysis**
- Status: ${analysis.trending.improving ? '⬆️ Improving' : '⬇️ Degrading'}
- Change: ${analysis.trending.improvementPercent.toFixed(2)}%

**Recent Errors**
${
    analysis.errorAnalysis.recentErrors.length > 0
        ? analysis.errorAnalysis.recentErrors
              .slice(0, 5)
              .map(e => `- ${e.status}: ${e.errorMessage || 'Unknown error'} (${e.responseTime}ms)`)
              .join('\n')
        : '- No recent errors'
}
`;
            await vscode.window.showInformationMessage(analysisText, { modal: true });
        }
    );

    // Command: Export metrics
    const exportMetricsCommand = vscode.commands.registerCommand(
        'stellarSuite.exportMetrics',
        async () => {
            const format = await vscode.window.showQuickPick(['JSON', 'CSV'], {
                placeHolder: 'Select export format'
            });

            if (!format) return;

            let content: string;
            let filename: string;
            let language: string;

            if (format === 'JSON') {
                content = metricsService.exportMetricsAsJson();
                filename = `rpc-metrics-${Date.now()}.json`;
                language = 'json';
            } else {
                content = metricsService.exportMetricsAsCsv();
                filename = `rpc-metrics-${Date.now()}.csv`;
                language = 'csv';
            }

            // Open in new document
            const doc = await vscode.workspace.openTextDocument({
                language,
                content
            });

            await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
            vscode.window.showInformationMessage(`Metrics exported as ${format}`);
        }
    );

    // Command: Clear metrics
    const clearMetricsCommand = vscode.commands.registerCommand(
        'stellarSuite.clearMetrics',
        async () => {
            const confirm = await vscode.window.showWarningMessage(
                'Are you sure you want to clear all collected metrics?',
                'Clear',
                'Cancel'
            );

            if (confirm === 'Clear') {
                metricsService.clearMetrics();
                vscode.window.showInformationMessage('Metrics cleared');
            }
        }
    );

    // Command: Get percentile response time
    const getPercentileCommand = vscode.commands.registerCommand(
        'stellarSuite.getResponseTimePercentile',
        async () => {
            const metrics = metricsService.getAllEndpointMetrics();
            if (metrics.length === 0) {
                vscode.window.showWarningMessage('No metrics collected yet');
                return;
            }

            const endpoints = metrics.map(m => m.endpoint);
            const endpoint = await vscode.window.showQuickPick(endpoints, {
                placeHolder: 'Select endpoint'
            });

            if (!endpoint) return;

            const percentileStr = await vscode.window.showInputBox({
                placeHolder: 'Enter percentile (e.g., 95)',
                validateInput: (value) => {
                    const num = parseFloat(value);
                    if (isNaN(num) || num < 0 || num > 100) {
                        return 'Enter a number between 0 and 100';
                    }
                    return '';
                }
            });

            if (!percentileStr) return;

            const percentile = parseFloat(percentileStr);
            const responseTime = metricsService.getResponseTimePercentile(endpoint, percentile);

            vscode.window.showInformationMessage(
                `P${percentile} response time for ${endpoint}: ${responseTime.toFixed(2)}ms`
            );
        }
    );

    // Command: Get throughput
    const getThroughputCommand = vscode.commands.registerCommand(
        'stellarSuite.getThroughput',
        async () => {
            const metrics = metricsService.getAllEndpointMetrics();
            if (metrics.length === 0) {
                vscode.window.showWarningMessage('No metrics collected yet');
                return;
            }

            const endpoints = metrics.map(m => m.endpoint);
            const endpoint = await vscode.window.showQuickPick(endpoints, {
                placeHolder: 'Select endpoint'
            });

            if (!endpoint) return;

            const windowStr = await vscode.window.showInputBox({
                placeHolder: 'Enter time window in seconds (default: 60)',
                value: '60',
                validateInput: (value) => {
                    const num = parseFloat(value);
                    if (isNaN(num) || num <= 0) {
                        return 'Enter a positive number';
                    }
                    return '';
                }
            });

            if (windowStr === undefined) return;

            const window = parseFloat(windowStr);
            const throughput = metricsService.getThroughput(endpoint, window);

            vscode.window.showInformationMessage(
                `Throughput for ${endpoint} (last ${window}s): ${throughput.toFixed(2)} req/s`
            );
        }
    );

    // Register all commands
    context.subscriptions.push(
        showMetricsCommand,
        viewMetricsSummaryCommand,
        viewEndpointAnalysisCommand,
        exportMetricsCommand,
        clearMetricsCommand,
        getPercentileCommand,
        getThroughputCommand
    );
}
