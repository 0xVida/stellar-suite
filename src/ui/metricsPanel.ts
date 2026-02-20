import * as vscode from 'vscode';
import { RpcMetricsService } from '../services/rpcMetricsService';
import * as path from 'path';

/**
 * Displays RPC performance metrics in the UI
 */
export class MetricsPanel {
    private panel?: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];

    constructor(
        private metricsService: RpcMetricsService,
        private extensionUri: vscode.Uri
    ) {
        // Subscribe to metrics updates
        metricsService.onMetricRecorded(() => {
            if (this.panel) {
                this.updatePanel();
            }
        });
    }

    /**
     * Show or focus the metrics panel
     */
    public async show(): Promise<void> {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Beside);
            return;
        }

        // Create new panel
        this.panel = vscode.window.createWebviewPanel(
            'rpcMetrics',
            'RPC Metrics',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.file(path.join(this.extensionUri.fsPath, 'assets'))]
            }
        );

        this.panel.onDidDispose(
            () => {
                this.panel = undefined;
            },
            null,
            this.disposables
        );

        this.updatePanel();
    }

    /**
     * Update the panel content
     */
    private updatePanel(): void {
        if (!this.panel) return;

        const globalMetrics = this.metricsService.getGlobalMetrics();
        this.panel.webview.html = this.getWebviewContent(globalMetrics);
    }

    /**
     * Generate HTML content for the metrics panel
     */
    private getWebviewContent(globalMetrics: any): string {
        const endpointRows = globalMetrics.endpointMetrics
            .map(
                (m: any) => `
            <tr>
                <td>${this.escapeHtml(m.endpoint)}</td>
                <td>${m.totalRequests}</td>
                <td>${m.successCount}</td>
                <td>${m.errorCount}</td>
                <td>${m.timeoutCount}</td>
                <td>${m.averageResponseTime.toFixed(2)}ms</td>
                <td>${m.successRate.toFixed(2)}%</td>
                <td>${m.errorRate.toFixed(2)}%</td>
            </tr>
        `
            )
            .join('');

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                        padding: 16px;
                        line-height: 1.6;
                    }
                    h1, h2 {
                        margin-top: 0;
                        color: var(--vscode-foreground);
                    }
                    .metric-card {
                        background-color: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-editor-border);
                        border-radius: 4px;
                        padding: 12px;
                        margin-bottom: 12px;
                    }
                    .metric-value {
                        font-size: 24px;
                        font-weight: bold;
                        color: var(--vscode-statusBar-foreground);
                    }
                    .metric-label {
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }
                    .metrics-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                        gap: 12px;
                        margin-bottom: 24px;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 12px;
                    }
                    th, td {
                        text-align: left;
                        padding: 8px;
                        border-bottom: 1px solid var(--vscode-editor-border);
                    }
                    th {
                        background-color: var(--vscode-editor-background);
                        font-weight: 600;
                        color: var(--vscode-descriptionForeground);
                    }
                    tr:hover {
                        background-color: var(--vscode-editor-hoverHighlightBackground);
                    }
                    .success {
                        color: #4ec9b0;
                    }
                    .error {
                        color: #f48771;
                    }
                    .warning {
                        color: #dcdcaa;
                    }
                </style>
            </head>
            <body>
                <h1>RPC Performance Metrics</h1>
                
                <h2>Global Summary</h2>
                <div class="metrics-grid">
                    <div class="metric-card">
                        <div class="metric-label">Total Requests</div>
                        <div class="metric-value">${globalMetrics.totalRequests}</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label success">Success Rate</div>
                        <div class="metric-value success">${globalMetrics.overallSuccessRate.toFixed(2)}%</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label error">Error Rate</div>
                        <div class="metric-value error">${globalMetrics.overallErrorRate.toFixed(2)}%</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label warning">Timeout Rate</div>
                        <div class="metric-value warning">${globalMetrics.overallTimeoutRate.toFixed(2)}%</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">Avg Response Time</div>
                        <div class="metric-value">${globalMetrics.averageResponseTime.toFixed(2)}ms</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">Throughput</div>
                        <div class="metric-value">${globalMetrics.averageThroughput.toFixed(2)} req/s</div>
                    </div>
                </div>

                <h2>Per-Endpoint Metrics</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Endpoint</th>
                            <th>Total</th>
                            <th class="success">Success</th>
                            <th class="error">Errors</th>
                            <th class="warning">Timeouts</th>
                            <th>Avg Time</th>
                            <th class="success">Success %</th>
                            <th class="error">Error %</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${endpointRows}
                    </tbody>
                </table>

                <div style="margin-top: 24px; padding: 12px; background-color: var(--vscode-editor-background); border-radius: 4px; color: var(--vscode-descriptionForeground); font-size: 12px;">
                    <p>Last updated: ${new Date().toLocaleTimeString()}</p>
                    <p>Refresh this panel to see the latest metrics.</p>
                </div>
            </body>
            </html>
        `;
    }

    /**
     * Escape HTML special characters
     */
    private escapeHtml(text: string): string {
        const htmlEscapeMap: { [key: string]: string } = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, (char) => htmlEscapeMap[char] || char);
    }

    /**
     * Dispose of resources
     */
    public dispose(): void {
        if (this.panel) {
            this.panel.dispose();
        }
        this.disposables.forEach(d => d.dispose());
    }
}
