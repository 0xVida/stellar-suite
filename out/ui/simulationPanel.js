"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimulationPanel = void 0;
const vscode = __importStar(require("vscode"));
class SimulationPanel {
    constructor(panel, context) {
        this._disposables = [];
        this._panel = panel;
        this._update();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'refresh':
                    this._update();
                    return;
            }
        }, null, this._disposables);
    }
    static createOrShow(context) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;
        if (SimulationPanel.currentPanel) {
            SimulationPanel.currentPanel._panel.reveal(column);
            return SimulationPanel.currentPanel;
        }
        const panel = vscode.window.createWebviewPanel('simulationPanel', 'Soroban Simulation Result', column || vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true
        });
        SimulationPanel.currentPanel = new SimulationPanel(panel, context);
        return SimulationPanel.currentPanel;
    }
    updateResults(result, contractId, functionName, args) {
        this._panel.webview.html = this._getHtmlForResults(result, contractId, functionName, args);
    }
    dispose() {
        SimulationPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
    _update() {
        this._panel.webview.html = this._getHtmlForLoading();
    }
    _getHtmlForLoading() {
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
    _getHtmlForResults(result, contractId, functionName, args) {
        const escapeHtml = (text) => {
            return text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        };
        const formatValue = (value) => {
            if (value === null || value === undefined) {
                return '<em>null</em>';
            }
            if (typeof value === 'object') {
                return `<pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
            }
            return escapeHtml(String(value));
        };
        const statusClass = result.success ? 'success' : 'error';
        const statusIcon = result.success ? '[OK]' : '[FAIL]';
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
        </div>
        `}
</body>
</html>`;
    }
}
exports.SimulationPanel = SimulationPanel;
//# sourceMappingURL=simulationPanel.js.map