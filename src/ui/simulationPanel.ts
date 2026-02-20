import * as vscode from 'vscode';
import { SimulationResult } from '../services/sorobanCliService';

/**
 * Manages the WebView panel that displays simulation results.
 */
export class SimulationPanel {
    private static currentPanel: SimulationPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
        this._panel = panel;

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'refresh':
                        this._update();
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    /**
     * Create or reveal the simulation panel.
     */
    public static createOrShow(context: vscode.ExtensionContext): SimulationPanel {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it
        if (SimulationPanel.currentPanel) {
            SimulationPanel.currentPanel._panel.reveal(column);
            return SimulationPanel.currentPanel;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            'simulationPanel',
            'Soroban Simulation Result',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        SimulationPanel.currentPanel = new SimulationPanel(panel, context);
        return SimulationPanel.currentPanel;
    }

    /**
     * Update the panel content with simulation results.
     */
    public updateResults(result: SimulationResult, contractId: string, functionName: string, args: any[]): void {
        this._panel.webview.html = this._getHtmlForResults(result, contractId, functionName, args);
    }

    /**
     * Dispose of the panel and clean up resources.
     */
    public dispose() {
        SimulationPanel.currentPanel = undefined;

        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _update() {
        this._panel.webview.html = this._getHtmlForLoading();
    }

    private _getHtmlForLoading(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Simulation Result</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        .loading {
            text-align: center;
            padding: 40px;
        }
    </style>
</head>
<body>
    <div class="loading">
        <p>Running simulation...</p>
    </div>
</body>
</html>`;
    }

    private _getHtmlForResults(result: SimulationResult, contractId: string, functionName: string, args: any[]): string {
        const escapeHtml = (text: string): string => {
            return text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        };

        const formatValue = (value: any): string => {
            if (value === null || value === undefined) {
                return '<em>null</em>';
            }
            if (typeof value === 'object') {
                return `<pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
            }
            return escapeHtml(String(value));
        };

        const statusClass = result.success ? 'success' : 'error';
        const statusIcon = result.success ? '✓' : '✗';
        const statusText = result.success ? 'Success' : 'Failed';

        const resourceUsageHtml = result.resourceUsage
            ? `
            <div class="section">
                <h3>Resource Usage</h3>
                <table>
                    ${result.resourceUsage.cpuInstructions ? `<tr><td>CPU Instructions:</td><td>${result.resourceUsage.cpuInstructions.toLocaleString()}</td></tr>` : ''}
                    ${result.resourceUsage.memoryBytes ? `<tr><td>Memory:</td><td>${(result.resourceUsage.memoryBytes / 1024).toFixed(2)} KB</td></tr>` : ''}
                </table>
            </div>
            `
            : '';

        const errorMetadataHtml = !result.success
            ? `
            <div class="error-meta">
                <table>
                    ${result.errorType ? `<tr><td>Error Type:</td><td>${escapeHtml(result.errorType)}</td></tr>` : ''}
                    ${result.errorCode ? `<tr><td>Error Code:</td><td>${escapeHtml(result.errorCode)}</td></tr>` : ''}
                    ${result.errorContext?.network ? `<tr><td>Network:</td><td>${escapeHtml(result.errorContext.network)}</td></tr>` : ''}
                    ${result.errorContext?.contractId ? `<tr><td>Contract:</td><td><code>${escapeHtml(result.errorContext.contractId)}</code></td></tr>` : ''}
                    ${result.errorContext?.functionName ? `<tr><td>Function:</td><td><code>${escapeHtml(result.errorContext.functionName)}</code></td></tr>` : ''}
                </table>
            </div>
            `
            : '';

        const suggestionsHtml = !result.success && result.errorSuggestions && result.errorSuggestions.length > 0
            ? `
            <h3>Suggested Resolution</h3>
            <ul class="error-suggestions">
                ${result.errorSuggestions.map(suggestion => `<li>${escapeHtml(suggestion)}</li>`).join('')}
            </ul>
            `
            : '';
    
     const validationWarningsHtml = result.validationWarnings && result.validationWarnings.length > 0
            ? `
            <div class="section">
                <h3>Pre-execution Warnings</h3>
                <ul class="validation-warnings">
                    ${result.validationWarnings.map(warning => `<li>${escapeHtml(warning)}</li>`).join('')}
                </ul>
            </div>
            `
            : '';
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Simulation Result</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            line-height: 1.6;
        }
        .status {
            padding: 12px 16px;
            border-radius: 4px;
            margin-bottom: 20px;
            font-weight: 600;
        }
        .status.success {
            background-color: var(--vscode-testing-iconPassed);
            color: var(--vscode-editor-background);
        }
        .status.error {
            background-color: var(--vscode-testing-iconFailed);
            color: var(--vscode-editor-background);
        }
        .section {
            margin-bottom: 24px;
        }
        .section h3 {
            margin-top: 0;
            margin-bottom: 12px;
            color: var(--vscode-textLink-foreground);
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 8px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        table td {
            padding: 8px 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        table td:first-child {
            font-weight: 600;
            width: 200px;
            color: var(--vscode-descriptionForeground);
        }
        pre {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 12px;
            border-radius: 4px;
            overflow-x: auto;
            margin: 8px 0;
            border: 1px solid var(--vscode-panel-border);
        }
        .error-message {
            background-color: var(--vscode-inputValidation-errorBackground);
            color: var(--vscode-inputValidation-errorForeground);
            padding: 12px;
            border-radius: 4px;
            border-left: 4px solid var(--vscode-inputValidation-errorBorder);
            white-space: pre-wrap;
            overflow-wrap: anywhere;
        }
        .error-meta {
            margin-top: 12px;
            padding: 12px;
            border-radius: 4px;
            border: 1px solid var(--vscode-panel-border);
            background-color: var(--vscode-textCodeBlock-background);
        }
        .error-meta table td:first-child {
            width: 140px;
        }
        .error-suggestions {
            margin-top: 12px;
            padding-left: 20px;
        }
        .error-suggestions li {
            margin-bottom: 6px;
        }
         .validation-warnings {
            margin-top: 12px;
            padding-left: 20px;
            color: var(--vscode-editorWarning-foreground);
        }
        .validation-warnings li {
            margin-bottom: 6px;
        }
        .result-value {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 12px;
            border-radius: 4px;
            border: 1px solid var(--vscode-panel-border);
        }
    </style>
</head>
<body>
    <div class="status ${statusClass}">
        ${statusIcon} ${statusText}
    </div>

    <div class="section">
        <h3>Transaction Details</h3>
        <table>
            <tr><td>Contract ID:</td><td><code>${escapeHtml(contractId)}</code></td></tr>
            <tr><td>Function:</td><td><code>${escapeHtml(functionName)}</code></td></tr>
            <tr><td>Arguments:</td><td><pre>${escapeHtml(JSON.stringify(args, null, 2))}</pre></td></tr>
        </table>
    </div>

      ${validationWarningsHtml}
    ${result.success
        ? `
        <div class="section">
            <h3>Return Value</h3>
            <div class="result-value">
                ${formatValue(result.result)}
            </div>
        </div>
        ${resourceUsageHtml}
        `
        : `
        <div class="section">
            <h3>Error</h3>
            <div class="error-message">
                ${escapeHtml(result.error || 'Unknown error occurred')}
            </div>
            ${errorMetadataHtml}
            ${suggestionsHtml}
        </div>
        `
    }
</body>
</html>`;
    }
}
