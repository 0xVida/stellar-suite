// ============================================================
// src/ui/simulationComparisonPanel.ts
// WebView panel for displaying side-by-side simulation comparisons.
// Provides interactive comparison view with difference highlighting
// and similarity detection.
// ============================================================

import * as vscode from 'vscode';
import { SimulationComparisonService, SimulationComparisonResult } from '../services/simulationComparisonService';
import { SimulationHistoryEntry } from '../services/simulationHistoryService';

/**
 * Manages the WebView panel for simulation comparison.
 */
export class SimulationComparisonPanel {
    private static currentPanel: SimulationComparisonPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly comparisonService: SimulationComparisonService;
    private _disposables: vscode.Disposable[] = [];
    private _currentComparison?: SimulationComparisonResult;

    private constructor(panel: vscode.WebviewPanel, private readonly _context: vscode.ExtensionContext) {
        this._panel = panel;
        this.comparisonService = new SimulationComparisonService();

        // Set initial content
        this._update();

        // Listen for panel disposal
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'refresh':
                        this._update();
                        return;
                    case 'exportComparison':
                        await this.exportComparison(message.format || 'json');
                        return;
                    case 'toggleDifferences':
                        // Handle UI state changes
                        return;
                    case 'toggleSimilarities':
                        // Handle UI state changes
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    /**
     * Create or reveal the comparison panel
     */
    public static createOrShow(context: vscode.ExtensionContext): SimulationComparisonPanel {
        const column = vscode.window.activeTextEditor?.viewColumn;

        // If we already have a panel, show it
        if (SimulationComparisonPanel.currentPanel) {
            SimulationComparisonPanel.currentPanel._panel.reveal(column);
            return SimulationComparisonPanel.currentPanel;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            'simulationComparisonPanel',
            'Simulation Comparison',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        SimulationComparisonPanel.currentPanel = new SimulationComparisonPanel(panel, context);
        return SimulationComparisonPanel.currentPanel;
    }

    /**
     * Update the panel with new comparison results
     */
    public updateComparison(simulations: SimulationHistoryEntry[], label?: string): void {
        try {
            this._currentComparison = this.comparisonService.compareSimulations(simulations, { label });
            this._panel.webview.html = this._getHtmlForComparison(this._currentComparison);
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this._panel.webview.html = this._getHtmlForError(errorMsg);
        }
    }

    /**
     * Dispose of the panel and clean up resources
     */
    public dispose() {
        SimulationComparisonPanel.currentPanel = undefined;
        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    /**
     * Export comparison results
     */
    private async exportComparison(format: 'json' | 'markdown' | 'html'): Promise<void> {
        if (!this._currentComparison) {
            vscode.window.showInformationMessage('Stellar Suite: No comparison to export.');
            return;
        }

        const extensions: Record<string, string[]> = {
            json: ['json'],
            markdown: ['md'],
            html: ['html'],
        };

        const defaultName = `simulation-comparison-${Date.now()}.${extensions[format][0]}`;
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(defaultName),
            filters: { [format.toUpperCase()]: extensions[format] },
            title: 'Export Simulation Comparison',
        });

        if (!uri) {
            return;
        }

        try {
            const content = this.comparisonService.exportComparison(this._currentComparison, {
                format,
                includeFullData: true,
                includeStateSnapshots: format === 'json',
            });
            await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
            vscode.window.showInformationMessage('Stellar Suite: Comparison exported successfully.');
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Stellar Suite: Failed to export comparison — ${msg}`);
        }
    }

    private _update() {
        if (this._currentComparison) {
            this._panel.webview.html = this._getHtmlForComparison(this._currentComparison);
        } else {
            this._panel.webview.html = this._getHtmlForLoading();
        }
    }

    private _getHtmlForLoading(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Simulation Comparison</title>
    ${this._getStyles()}
</head>
<body>
    <div class="loading">
        <p>Select simulations to compare...</p>
        <p class="hint">Use the "Compare Simulations" command to select simulations from history.</p>
    </div>
</body>
</html>`;
    }

    private _getHtmlForError(error: string): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Simulation Comparison - Error</title>
    ${this._getStyles()}
</head>
<body>
    <div class="error-container">
        <h2>❌ Error</h2>
        <p>${this._escapeHtml(error)}</p>
    </div>
</body>
</html>`;
    }

    private _getHtmlForComparison(comparison: SimulationComparisonResult): string {
        const vscode = this._getVsCodeApi();
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Simulation Comparison</title>
    ${this._getStyles()}
</head>
<body>
    <div class="comparison-container">
        ${this._renderHeader(comparison)}
        ${this._renderOverview(comparison)}
        ${this._renderDifferences(comparison)}
        ${this._renderSimilarities(comparison)}
        ${this._renderDetailedComparison(comparison)}
        ${this._renderExportButtons()}
    </div>
    ${vscode}
    ${this._getScripts()}
</body>
</html>`;
    }

    private _renderHeader(comparison: SimulationComparisonResult): string {
        const label = comparison.label || 'Unnamed Comparison';
        const similarityClass = this._getSimilarityClass(comparison.overallSimilarity);
        
        return `
<div class="header">
    <h1>🔍 Simulation Comparison</h1>
    ${comparison.label ? `<h2>${this._escapeHtml(comparison.label)}</h2>` : ''}
    <div class="meta">
        <span>Simulations: ${comparison.count}</span>
        <span>•</span>
        <span>Compared: ${new Date(comparison.comparedAt).toLocaleString()}</span>
        <span>•</span>
        <span class="similarity-badge ${similarityClass}">
            Overall Similarity: ${comparison.overallSimilarity.toFixed(1)}%
        </span>
    </div>
</div>`;
    }

    private _renderOverview(comparison: SimulationComparisonResult): string {
        return `
<div class="section overview">
    <h3>📊 Overview</h3>
    <div class="stats-grid">
        <div class="stat-card">
            <div class="stat-label">Differences</div>
            <div class="stat-value ${comparison.differences.length > 0 ? 'warning' : 'success'}">
                ${comparison.differences.length}
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Similarities</div>
            <div class="stat-value success">${comparison.similarities.length}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Outcome Match</div>
            <div class="stat-value ${comparison.outcomeComparison.allMatch ? 'success' : 'error'}">
                ${comparison.outcomeComparison.allMatch ? '✓ Yes' : '✗ No'}
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-label">State Similarity</div>
            <div class="stat-value">${comparison.stateComparison.similarity.toFixed(1)}%</div>
        </div>
    </div>
</div>`;
    }

    private _renderDifferences(comparison: SimulationComparisonResult): string {
        if (comparison.differences.length === 0) {
            return `
<div class="section">
    <h3>✅ No Differences Found</h3>
    <p class="success-message">All simulations produced identical results.</p>
</div>`;
        }

        const differencesHtml = comparison.differences.map(diff => {
            const severityClass = `severity-${diff.severity}`;
            const icon = this._getSeverityIcon(diff.severity);
            
            return `
<div class="difference-item ${severityClass}">
    <div class="difference-header">
        <span class="severity-icon">${icon}</span>
        <span class="metric-badge">${diff.metric}</span>
        <span class="severity-label">${diff.severity}</span>
    </div>
    <div class="difference-description">${this._escapeHtml(diff.description)}</div>
    ${this._renderDifferenceDetails(diff.details)}
</div>`;
        }).join('');

        return `
<div class="section differences">
    <h3>⚠️ Differences (${comparison.differences.length})</h3>
    <div class="differences-list">
        ${differencesHtml}
    </div>
</div>`;
    }

    private _renderDifferenceDetails(details: Record<string, unknown>): string {
        if (Object.keys(details).length === 0) {
            return '';
        }

        const detailsJson = JSON.stringify(details, null, 2);
        return `
<details class="difference-details">
    <summary>View Details</summary>
    <pre>${this._escapeHtml(detailsJson)}</pre>
</details>`;
    }

    private _renderSimilarities(comparison: SimulationComparisonResult): string {
        if (comparison.similarities.length === 0) {
            return '';
        }

        const similaritiesHtml = comparison.similarities.map(sim => {
            const scoreClass = this._getSimilarityClass(sim.score);
            
            return `
<div class="similarity-item">
    <div class="similarity-header">
        <span class="metric-badge">${sim.metric}</span>
        <span class="similarity-score ${scoreClass}">${sim.score.toFixed(1)}%</span>
    </div>
    <div class="similarity-description">${this._escapeHtml(sim.description)}</div>
</div>`;
        }).join('');

        return `
<div class="section similarities">
    <h3>✨ Similarities (${comparison.similarities.length})</h3>
    <div class="similarities-list">
        ${similaritiesHtml}
    </div>
</div>`;
    }

    private _renderDetailedComparison(comparison: SimulationComparisonResult): string {
        return `
<div class="section detailed-comparison">
    <h3>📋 Detailed Comparison</h3>
    
    <div class="comparison-section">
        <h4>Outcomes</h4>
        <table class="comparison-table">
            <thead>
                <tr>
                    <th>Simulation</th>
                    <th>Outcome</th>
                    <th>Result/Error</th>
                </tr>
            </thead>
            <tbody>
                ${this._renderOutcomeRows(comparison)}
            </tbody>
        </table>
    </div>

    <div class="comparison-section">
        <h4>Resource Usage</h4>
        ${this._renderResourceComparison(comparison)}
    </div>

    <div class="comparison-section">
        <h4>State Changes</h4>
        ${this._renderStateComparison(comparison)}
    </div>

    <div class="comparison-section">
        <h4>Parameters</h4>
        ${this._renderParameterComparison(comparison)}
    </div>

    <div class="comparison-section">
        <h4>Timing</h4>
        ${this._renderTimingComparison(comparison)}
    </div>
</div>`;
    }

    private _renderOutcomeRows(comparison: SimulationComparisonResult): string {
        return comparison.simulations.map((sim, idx) => {
            const outcomeClass = sim.outcome === 'success' ? 'success' : 'error';
            const resultInfo = sim.outcome === 'success' 
                ? (sim.result ? JSON.stringify(sim.result).substring(0, 100) : 'No result')
                : (sim.error || 'Unknown error');
            
            return `
<tr>
    <td>Simulation ${idx + 1}</td>
    <td class="${outcomeClass}">${sim.outcome}</td>
    <td class="code-cell">${this._escapeHtml(resultInfo)}</td>
</tr>`;
        }).join('');
    }

    private _renderResourceComparison(comparison: SimulationComparisonResult): string {
        const { resourceComparison } = comparison;
        
        let html = '<table class="comparison-table">';
        html += '<thead><tr><th>Metric</th>';
        comparison.simulations.forEach((_, idx) => {
            html += `<th>Sim ${idx + 1}</th>`;
        });
        html += '<th>Min</th><th>Max</th><th>Avg</th><th>Variance</th></tr></thead><tbody>';

        // CPU Instructions
        if (resourceComparison.cpuInstructions) {
            html += '<tr><td>CPU Instructions</td>';
            resourceComparison.cpuInstructions.values.forEach(val => {
                html += `<td>${val ? val.toLocaleString() : 'N/A'}</td>`;
            });
            html += `<td>${resourceComparison.cpuInstructions.min.toLocaleString()}</td>`;
            html += `<td>${resourceComparison.cpuInstructions.max.toLocaleString()}</td>`;
            html += `<td>${resourceComparison.cpuInstructions.avg.toLocaleString()}</td>`;
            html += `<td>${resourceComparison.cpuInstructions.percentDifference.toFixed(1)}%</td>`;
            html += '</tr>';
        }

        // Memory
        if (resourceComparison.memoryBytes) {
            html += '<tr><td>Memory (KB)</td>';
            resourceComparison.memoryBytes.values.forEach(val => {
                html += `<td>${val ? (val / 1024).toFixed(2) : 'N/A'}</td>`;
            });
            html += `<td>${(resourceComparison.memoryBytes.min / 1024).toFixed(2)}</td>`;
            html += `<td>${(resourceComparison.memoryBytes.max / 1024).toFixed(2)}</td>`;
            html += `<td>${(resourceComparison.memoryBytes.avg / 1024).toFixed(2)}</td>`;
            html += `<td>${resourceComparison.memoryBytes.percentDifference.toFixed(1)}%</td>`;
            html += '</tr>';
        }

        html += '</tbody></table>';
        return html;
    }

    private _renderStateComparison(comparison: SimulationComparisonResult): string {
        const { stateComparison } = comparison;
        
        return `
<div class="state-summary">
    <p><strong>Common Changes:</strong> ${stateComparison.summary.totalCommonChanges}</p>
    <p><strong>Unique Changes:</strong> ${stateComparison.summary.totalUniqueChanges}</p>
    <p><strong>Conflicts:</strong> ${stateComparison.summary.totalConflicts}</p>
    <p><strong>Similarity:</strong> ${stateComparison.similarity.toFixed(1)}%</p>
</div>
${stateComparison.conflicts.length > 0 ? this._renderConflicts(stateComparison.conflicts) : ''}`;
    }

    private _renderConflicts(conflicts: any[]): string {
        const conflictsHtml = conflicts.map(conflict => `
<div class="conflict-item">
    <strong>Key:</strong> ${this._escapeHtml(conflict.key)}<br>
    <strong>Type:</strong> ${conflict.changeType}<br>
    <strong>Conflicting Values:</strong> ${Array.from(conflict.values.entries()).map((entry: unknown) => {
        const [id, val] = entry as [string, any];
        return `<div class="conflict-value">Sim ${id}: ${this._escapeHtml(JSON.stringify(val))}</div>`;
    }).join('')}
</div>`).join('');

        return `
<details class="conflicts-section">
    <summary>⚠️ View Conflicts (${conflicts.length})</summary>
    ${conflictsHtml}
</details>`;
    }

    private _renderParameterComparison(comparison: SimulationComparisonResult): string {
        const { parameterComparison } = comparison;
        
        return `
<table class="comparison-table">
    <tr>
        <td>Contract ID Match</td>
        <td class="${parameterComparison.contractIdMatches ? 'success' : 'warning'}">
            ${parameterComparison.contractIdMatches ? '✓ Yes' : '✗ No'}
        </td>
    </tr>
    <tr>
        <td>Function Name Match</td>
        <td class="${parameterComparison.functionNameMatches ? 'success' : 'warning'}">
            ${parameterComparison.functionNameMatches ? '✓ Yes' : '✗ No'}
        </td>
    </tr>
    <tr>
        <td>Arguments Match</td>
        <td class="${parameterComparison.argsMatch ? 'success' : 'warning'}">
            ${parameterComparison.argsMatch ? '✓ Yes' : '✗ No'}
        </td>
    </tr>
    <tr>
        <td>Network Match</td>
        <td class="${parameterComparison.networkMatches ? 'success' : 'warning'}">
            ${parameterComparison.networkMatches ? '✓ Yes' : '✗ No'}
        </td>
    </tr>
    <tr>
        <td>Similarity</td>
        <td>${parameterComparison.similarity.toFixed(1)}%</td>
    </tr>
</table>`;
    }

    private _renderTimingComparison(comparison: SimulationComparisonResult): string {
        const { timingComparison } = comparison;
        
        if (!timingComparison.min) {
            return '<p>No timing data available</p>';
        }

        return `
<table class="comparison-table">
    <tr>
        <td>Min Duration</td>
        <td>${timingComparison.min?.toFixed(2)} ms</td>
    </tr>
    <tr>
        <td>Max Duration</td>
        <td>${timingComparison.max?.toFixed(2)} ms</td>
    </tr>
    <tr>
        <td>Avg Duration</td>
        <td>${timingComparison.avg?.toFixed(2)} ms</td>
    </tr>
    <tr>
        <td>Variance</td>
        <td>${timingComparison.percentDifference.toFixed(1)}%</td>
    </tr>
</table>`;
    }

    private _renderExportButtons(): string {
        return `
<div class="section export-section">
    <h3>💾 Export</h3>
    <div class="export-buttons">
        <button class="export-btn" onclick="exportComparison('json')">Export as JSON</button>
        <button class="export-btn" onclick="exportComparison('markdown')">Export as Markdown</button>
        <button class="export-btn" onclick="exportComparison('html')">Export as HTML</button>
    </div>
</div>`;
    }

    private _getSeverityIcon(severity: string): string {
        switch (severity) {
            case 'critical': return '🔴';
            case 'major': return '🟠';
            case 'minor': return '🟡';
            default: return '⚪';
        }
    }

    private _getSimilarityClass(score: number): string {
        if (score >= 90) return 'similarity-high';
        if (score >= 70) return 'similarity-medium';
        return 'similarity-low';
    }

    private _escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    private _getVsCodeApi(): string {
        return `
<script>
    const vscode = acquireVsCodeApi();
</script>`;
    }

    private _getScripts(): string {
        return `
<script>
    function exportComparison(format) {
        vscode.postMessage({ command: 'exportComparison', format });
    }

    function toggleSection(sectionId) {
        const section = document.getElementById(sectionId);
        if (section) {
            section.classList.toggle('collapsed');
        }
    }
</script>`;
    }

    private _getStyles(): string {
        return `
<style>
    :root {
        --color-success: #4caf50;
        --color-warning: #ff9800;
        --color-error: #f44336;
        --color-info: #2196f3;
        --border-radius: 6px;
        --spacing: 16px;
    }

    body {
        font-family: var(--vscode-font-family);
        padding: 20px;
        color: var(--vscode-foreground);
        background-color: var(--vscode-editor-background);
        line-height: 1.6;
    }

    .loading, .error-container {
        text-align: center;
        padding: 60px 20px;
    }

    .hint {
        color: var(--vscode-descriptionForeground);
        font-size: 0.9em;
        margin-top: 10px;
    }

    .comparison-container {
        max-width: 1400px;
        margin: 0 auto;
    }

    .header {
        margin-bottom: 30px;
        padding-bottom: 20px;
        border-bottom: 1px solid var(--vscode-panel-border);
    }

    .header h1 {
        margin: 0 0 10px 0;
        font-size: 2em;
    }

    .header h2 {
        margin: 0 0 10px 0;
        color: var(--vscode-descriptionForeground);
        font-size: 1.3em;
        font-weight: normal;
    }

    .meta {
        display: flex;
        gap: 10px;
        align-items: center;
        font-size: 0.9em;
        color: var(--vscode-descriptionForeground);
    }

    .similarity-badge {
        padding: 4px 12px;
        border-radius: var(--border-radius);
        font-weight: 500;
    }

    .similarity-high {
        background-color: rgba(76, 175, 80, 0.2);
        color: var(--color-success);
    }

    .similarity-medium {
        background-color: rgba(255, 152, 0, 0.2);
        color: var(--color-warning);
    }

    .similarity-low {
        background-color: rgba(244, 67, 54, 0.2);
        color: var(--color-error);
    }

    .section {
        margin-bottom: 30px;
        padding: 20px;
        background-color: var(--vscode-editor-background);
        border: 1px solid var(--vscode-panel-border);
        border-radius: var(--border-radius);
    }

    .section h3 {
        margin-top: 0;
        font-size: 1.4em;
    }

    .section h4 {
        margin-top: 20px;
        margin-bottom: 10px;
        font-size: 1.1em;
    }

    .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 15px;
    }

    .stat-card {
        padding: 15px;
        background-color: var(--vscode-input-background);
        border: 1px solid var(--vscode-input-border);
        border-radius: var(--border-radius);
        text-align: center;
    }

    .stat-label {
        font-size: 0.9em;
        color: var(--vscode-descriptionForeground);
        margin-bottom: 8px;
    }

    .stat-value {
        font-size: 1.8em;
        font-weight: bold;
    }

    .stat-value.success {
        color: var(--color-success);
    }

    .stat-value.warning {
        color: var(--color-warning);
    }

    .stat-value.error {
        color: var(--color-error);
    }

    .differences-list, .similarities-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .difference-item, .similarity-item {
        padding: 15px;
        border-left: 4px solid var(--vscode-panel-border);
        background-color: var(--vscode-input-background);
        border-radius: var(--border-radius);
    }

    .difference-item.severity-critical {
        border-left-color: var(--color-error);
    }

    .difference-item.severity-major {
        border-left-color: var(--color-warning);
    }

    .difference-item.severity-minor {
        border-left-color: var(--color-info);
    }

    .difference-header, .similarity-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 8px;
    }

    .severity-icon {
        font-size: 1.2em;
    }

    .metric-badge {
        display: inline-block;
        padding: 2px 8px;
        background-color: var(--vscode-badge-background);
        color: var(--vscode-badge-foreground);
        border-radius: 3px;
        font-size: 0.85em;
        font-weight: 500;
    }

    .severity-label {
        font-size: 0.85em;
        color: var(--vscode-descriptionForeground);
        text-transform: uppercase;
    }

    .similarity-score {
        font-weight: bold;
        font-size: 1.1em;
    }

    .difference-description, .similarity-description {
        font-size: 0.95em;
    }

    .difference-details {
        margin-top: 10px;
    }

    .difference-details pre {
        margin: 10px 0 0 0;
        padding: 10px;
        background-color: var(--vscode-textCodeBlock-background);
        border-radius: 4px;
        font-size: 0.85em;
        overflow-x: auto;
    }

    .comparison-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 10px;
        font-size: 0.9em;
    }

    .comparison-table th,
    .comparison-table td {
        padding: 10px;
        border: 1px solid var(--vscode-panel-border);
        text-align: left;
    }

    .comparison-table th {
        background-color: var(--vscode-input-background);
        font-weight: 600;
    }

    .comparison-table .success {
        color: var(--color-success);
    }

    .comparison-table .warning {
        color: var(--color-warning);
    }

    .comparison-table .error {
        color: var(--color-error);
    }

    .comparison-table .code-cell {
        font-family: var(--vscode-editor-font-family);
        font-size: 0.85em;
        max-width: 300px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .state-summary {
        background-color: var(--vscode-input-background);
        padding: 15px;
        border-radius: var(--border-radius);
        margin-bottom: 15px;
    }

    .state-summary p {
        margin: 5px 0;
    }

    .conflicts-section {
        margin-top: 15px;
    }

    .conflict-item {
        padding: 10px;
        background-color: var(--vscode-textCodeBlock-background);
        border-left: 3px solid var(--color-warning);
        margin-bottom: 10px;
        border-radius: 4px;
    }

    .conflict-value {
        margin-left: 20px;
        font-family: var(--vscode-editor-font-family);
        font-size: 0.9em;
    }

    .export-buttons {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
    }

    .export-btn {
        padding: 10px 20px;
        background-color: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border: none;
        border-radius: var(--border-radius);
        cursor: pointer;
        font-size: 0.95em;
        transition: background-color 0.2s;
    }

    .export-btn:hover {
        background-color: var(--vscode-button-hoverBackground);
    }

    .success-message {
        color: var(--color-success);
        font-size: 1.1em;
        text-align: center;
        padding: 20px;
    }

    .comparison-section {
        margin-bottom: 25px;
    }

    details {
        margin-top: 10px;
    }

    summary {
        cursor: pointer;
        font-weight: 500;
        padding: 8px;
        background-color: var(--vscode-input-background);
        border-radius: 4px;
        user-select: none;
    }

    summary:hover {
        background-color: var(--vscode-list-hoverBackground);
    }
</style>`;
    }
}
