import * as vscode from "vscode";
import { SimulationResult } from "../services/sorobanCliService";
import { StateDiffService } from "../services/stateDiffService";
import { StateDiffChange } from "../types/simulationState";
import { SimulationChartDataService } from "../services/simulationChartDataService";
import { SimulationChartRenderer } from "../services/simulationChartRenderer";

/**
 * Manages the WebView panel that displays simulation results.
 */
export class SimulationPanel {
  private static currentPanel: SimulationPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly stateDiffService = new StateDiffService();
  private _disposables: vscode.Disposable[] = [];
  private _latestStateDiff = undefined as SimulationResult["stateDiff"];
  private _latestContractId = "";
  private _latestFunctionName = "";
  private _latestResult: SimulationResult | undefined;
  private _latestArgs: any[] = [];
  private readonly _context: vscode.ExtensionContext;

  private constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
  ) {
    this._panel = panel;
    this._context = context;

    // Set the webview's initial html content
    this._update();

    // Listen for when the panel is disposed
    // This happens when the user closes the panel or when the panel is closed programmatically
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      async (message: {
        command: string;
        chartId?: string;
        dataUrl?: string;
      }) => {
        switch (message.command) {
          case "refresh":
            this._update();
            return;
          case "exportStateDiff":
            await this.exportStateDiff();
            return;
          case "exportChartAsPng":
            await this._exportChartAsPng(message.chartId!, message.dataUrl!);
            return;
          case "exportAsJson":
            await this.exportCurrentResult("json");
            return;
          case "exportAsCsv":
            await this.exportCurrentResult("csv");
            return;
          case "exportAsPdf":
            await this.exportCurrentResult("pdf");
            return;
        }
      },
      null,
      this._disposables,
    );
  }

  /**
   * Create or reveal the simulation panel.
   */
  public static createOrShow(
    context: vscode.ExtensionContext,
  ): SimulationPanel {
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
      "simulationPanel",
      "Soroban Simulation Result",
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    SimulationPanel.currentPanel = new SimulationPanel(panel, context);
    return SimulationPanel.currentPanel;
  }

  /**
   * Update the panel content with simulation results.
   */
  public updateResults(
    result: SimulationResult,
    contractId: string,
    functionName: string,
    args: any[],
  ): void {
    this._latestStateDiff = result.stateDiff;
    this._latestContractId = contractId;
    this._latestFunctionName = functionName;
    this._latestResult = result;
    this._latestArgs = args;
    this._panel.webview.html = this._getHtmlForResults(
      result,
      contractId,
      functionName,
      args,
    );
  }

  /**
   * Export the current simulation result.
   */
  private async exportCurrentResult(
    format: "json" | "csv" | "pdf",
  ): Promise<void> {
    if (!this._latestResult) {
      vscode.window.showInformationMessage(
        "Stellar Suite: No simulation result to export.",
      );
      return;
    }

    // Import the export command
    const { exportCurrentSimulation } =
      await import("../commands/exportCommands");

    // Create a history entry from the current result
    const entry = {
      id: `temp_${Date.now()}`,
      timestamp: new Date().toISOString(),
      contractId: this._latestContractId,
      functionName: this._latestFunctionName,
      args: this._latestArgs,
      outcome: this._latestResult.success
        ? ("success" as const)
        : ("failure" as const),
      result: this._latestResult.result,
      error: this._latestResult.error,
      errorType: this._latestResult.errorType,
      resourceUsage: this._latestResult.resourceUsage,
      network: "testnet", // Default, could be made configurable
      source: "dev", // Default, could be made configurable
      method: "cli" as const,
      stateDiff: this._latestResult.stateDiff,
    };

    await exportCurrentSimulation(this._context, entry, format);
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

  private async exportStateDiff(): Promise<void> {
    if (!this._latestStateDiff) {
      vscode.window.showInformationMessage(
        "Stellar Suite: No state diff to export.",
      );
      return;
    }

    const defaultName = `simulation-state-diff-${this.sanitizeForFileName(this._latestContractId)}-${this.sanitizeForFileName(this._latestFunctionName)}.json`;
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(defaultName),
      filters: { "JSON Files": ["json"] },
      title: "Export State Diff",
    });

    if (!uri) {
      return;
    }

    try {
      const payload = this.stateDiffService.exportStateDiff(
        this._latestStateDiff,
        {
          includeSnapshots: true,
        },
      );
      const encoder = new TextEncoder();
      await vscode.workspace.fs.writeFile(uri, encoder.encode(payload));
      vscode.window.showInformationMessage(
        "Stellar Suite: State diff exported successfully.",
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(
        `Stellar Suite: Failed to export state diff — ${msg}`,
      );
    }
  }

  private async _exportChartAsPng(chartId: string, dataUrl: string) {
    if (!dataUrl) {
      vscode.window.showErrorMessage(`Failed to export chart: ${chartId}`);
      return;
    }

    try {
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`simulation-chart-${chartId}.png`),
        filters: {
          Images: ["png"],
        },
      });

      if (uri) {
        // Remove the data:image/png;base64, prefix
        const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
        const imageBuffer = Buffer.from(base64Data, "base64");

        await vscode.workspace.fs.writeFile(uri, imageBuffer);
        vscode.window.showInformationMessage(`Chart exported to ${uri.fsPath}`);
      }
    } catch (error) {
      console.error("Error saving chart image:", error);
      vscode.window.showErrorMessage(`Failed to save chart: ${error}`);
    }
  }

  private sanitizeForFileName(value: string): string {
    return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48) || "simulation";
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
  private _getChartsHtml(result: SimulationResult): string {
    const sections: string[] = [];

    // Resource usage bar chart
    const resourceBars =
      SimulationChartDataService.getResourceUsageBars(result);
    if (resourceBars.length > 0) {
      const svg = SimulationChartRenderer.renderHorizontalBarChart(
        resourceBars,
        {
          title: "Resource Usage",
        },
      );
      if (svg) {
        const svgWithId = svg.replace(
          'class="simulation-chart simulation-chart-bar"',
          'id="chart-resource-usage" class="simulation-chart simulation-chart-bar"',
        );
        sections.push(`
          <div class="section chart-section">
            <h3>Resource Usage Chart</h3>
            ${svgWithId}
            <div class="chart-actions">
              <button class="btn btn-sm" onclick="exportChartAsPng('chart-resource-usage')">Export as PNG</button>
            </div>
          </div>
        `);
      }
    }

    // Resource proportion doughnut (CPU vs Memory)
    const proportionSlices =
      SimulationChartDataService.getResourceProportionDoughnut(result);
    if (proportionSlices.length > 0) {
      const svg = SimulationChartRenderer.renderDoughnutChart(
        proportionSlices,
        { title: "Execution Time Breakdown" },
      );
      if (svg) {
        const svgWithId = svg.replace(
          'class="simulation-chart simulation-chart-doughnut"',
          'id="chart-execution-time" class="simulation-chart simulation-chart-doughnut"',
        );
        sections.push(`
          <div class="section chart-section">
            <h3>Execution Time Chart</h3>
            ${svgWithId}
            <div class="chart-actions">
              <button class="btn btn-sm" onclick="exportChartAsPng('chart-execution-time')">Export as PNG</button>
            </div>
          </div>
        `);
      }
    }

    // State diff summary chart
    const diffBars = SimulationChartDataService.getStateDiffSummary(result);
    if (diffBars.length > 0) {
      const svg = SimulationChartRenderer.renderHorizontalBarChart(diffBars, {
        title: "State Changes",
      });
      if (svg) {
        const svgWithId = svg.replace(
          'class="simulation-chart simulation-chart-bar"',
          'id="chart-state-diff" class="simulation-chart simulation-chart-bar"',
        );
        sections.push(`
          <div class="section chart-section">
            <h3>State Changes Chart</h3>
            ${svgWithId}
            <div class="chart-actions">
              <button class="btn btn-sm" onclick="exportChartAsPng('chart-state-diff')">Export as PNG</button>
            </div>
          </div>
        `);
      }
    }

    if (sections.length === 0) {
      return "";
    }

    // Tooltip detail panel for interactive hover info
    return `
      <div id="chart-tooltip" style="display:none;position:fixed;padding:6px 10px;background:var(--vscode-editorHoverWidget-background,#252526);border:1px solid var(--vscode-editorHoverWidget-border,#454545);border-radius:4px;font-size:12px;pointer-events:none;z-index:1000;color:var(--vscode-foreground,#ccc)"></div>
      ${sections.join("\n")}
    `;
  }

  private _getHtmlForResults(
    result: SimulationResult,
    contractId: string,
    functionName: string,
    args: any[],
  ): string {
    const escapeHtml = (text: string): string => {
      return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };

    const formatValue = (value: any): string => {
      if (value === null || value === undefined) {
        return "<em>null</em>";
      }
      if (typeof value === "object") {
        return `<pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
      }
      return escapeHtml(String(value));
    };

    const statusClass = result.success ? "success" : "error";
    const statusIcon = result.success ? "✓" : "✗";
    const statusText = result.success ? "Success" : "Failed";
    const resourceUsageHtml = result.resourceUsage
      ? `
            <div class="section">
                <h3>Resource Usage</h3>
                <table>
                    ${result.resourceUsage.cpuInstructions ? `<tr><td>CPU Instructions:</td><td>${result.resourceUsage.cpuInstructions.toLocaleString()}</td></tr>` : ""}
                    ${result.resourceUsage.memoryBytes ? `<tr><td>Memory:</td><td>${(result.resourceUsage.memoryBytes / 1024).toFixed(2)} KB</td></tr>` : ""}
                </table>
            </div>
            `
      : "";

    const errorMetadataHtml = !result.success
      ? `
            <div class="error-meta">
                <table>
                    ${result.errorType ? `<tr><td>Error Type:</td><td>${escapeHtml(result.errorType)}</td></tr>` : ""}
                    ${result.errorCode ? `<tr><td>Error Code:</td><td>${escapeHtml(result.errorCode)}</td></tr>` : ""}
                    ${result.errorContext?.network ? `<tr><td>Network:</td><td>${escapeHtml(result.errorContext.network)}</td></tr>` : ""}
                    ${result.errorContext?.contractId ? `<tr><td>Contract:</td><td><code>${escapeHtml(result.errorContext.contractId)}</code></td></tr>` : ""}
                    ${result.errorContext?.functionName ? `<tr><td>Function:</td><td><code>${escapeHtml(result.errorContext.functionName)}</code></td></tr>` : ""}
                </table>
            </div>
            `
      : "";

    const suggestionsHtml =
      !result.success &&
      result.errorSuggestions &&
      result.errorSuggestions.length > 0
        ? `
            <h3>Suggested Resolution</h3>
            <ul class="error-suggestions">
                ${result.errorSuggestions.map((suggestion) => `<li>${escapeHtml(suggestion)}</li>`).join("")}
            </ul>
            `
        : "";

    const validationWarningsHtml =
      result.validationWarnings && result.validationWarnings.length > 0
        ? `
            <div class="section">
                <h3>Pre-execution Warnings</h3>
                <ul class="validation-warnings">
                    ${result.validationWarnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}
                </ul>
            </div>
            `
        : "";

    const renderChangeRows = (
      changes: StateDiffChange[],
      changeType: "created" | "modified" | "deleted",
    ) => {
      if (changes.length === 0) {
        return '<tr><td colspan="4"><em>No entries</em></td></tr>';
      }

      return changes
        .map((change) => {
          const beforeValue =
            changeType === "created"
              ? "<em>n/a</em>"
              : formatValue(change.beforeValue);
          const afterValue =
            changeType === "deleted"
              ? "<em>n/a</em>"
              : formatValue(change.afterValue);

          return `
                <tr class="diff-row diff-row-${changeType}">
                    <td><code>${escapeHtml(change.key)}</code></td>
                    <td>${change.contractId ? `<code>${escapeHtml(change.contractId)}</code>` : "<em>global</em>"}</td>
                    <td>${beforeValue}</td>
                    <td>${afterValue}</td>
                </tr>
                `;
        })
        .join("");
    };

    const stateDiffHtml = result.stateDiff
      ? `
            <div class="section">
                <h3>State Diff</h3>
                <div class="diff-actions">
                    <button class="btn" onclick="exportStateDiff()">Export State Diff</button>
                </div>

                <div class="diff-summary-grid">
                    <div class="diff-summary-item"><strong>Before:</strong> ${result.stateDiff.summary.totalEntriesBefore}</div>
                    <div class="diff-summary-item"><strong>After:</strong> ${result.stateDiff.summary.totalEntriesAfter}</div>
                    <div class="diff-summary-item created"><strong>Created:</strong> ${result.stateDiff.summary.created}</div>
                    <div class="diff-summary-item modified"><strong>Modified:</strong> ${result.stateDiff.summary.modified}</div>
                    <div class="diff-summary-item deleted"><strong>Deleted:</strong> ${result.stateDiff.summary.deleted}</div>
                    <div class="diff-summary-item"><strong>Unchanged:</strong> ${result.stateDiff.summary.unchanged}</div>
                </div>

                <div class="state-change-group">
                    <h4>Modified Entries</h4>
                    <table>
                        <thead>
                            <tr><th>Key</th><th>Contract</th><th>Before</th><th>After</th></tr>
                        </thead>
                        <tbody>
                            ${renderChangeRows(result.stateDiff.modified, "modified")}
                        </tbody>
                    </table>
                </div>

                <div class="state-change-group">
                    <h4>Created Entries</h4>
                    <table>
                        <thead>
                            <tr><th>Key</th><th>Contract</th><th>Before</th><th>After</th></tr>
                        </thead>
                        <tbody>
                            ${renderChangeRows(result.stateDiff.created, "created")}
                        </tbody>
                    </table>
                </div>

                <div class="state-change-group">
                    <h4>Deleted Entries</h4>
                    <table>
                        <thead>
                            <tr><th>Key</th><th>Contract</th><th>Before</th><th>After</th></tr>
                        </thead>
                        <tbody>
                            ${renderChangeRows(result.stateDiff.deleted, "deleted")}
                        </tbody>
                    </table>
                </div>
            </div>
            `
      : "";

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
        table td,
        table th {
            padding: 8px 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
            text-align: left;
            vertical-align: top;
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
        .diff-actions {
            margin-bottom: 12px;
        }
        .btn {
            border: 1px solid var(--vscode-button-border, transparent);
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
        }
        .btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .btn-sm {
            padding: 3px 8px;
            font-size: 11px;
        }
        .chart-section {
            margin-top: 8px;
        }
        .chart-section svg {
            display: block;
            margin: 8px 0;
            max-width: 100%;
            height: auto;
        }
        .chart-actions {
            margin-top: 4px;
        }
        .diff-summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
            gap: 8px;
            margin-bottom: 16px;
        }
        .diff-summary-item {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 8px 10px;
            background-color: var(--vscode-textCodeBlock-background);
        }
        .diff-summary-item.created {
            border-left: 3px solid var(--vscode-testing-iconPassed);
        }
        .diff-summary-item.modified {
            border-left: 3px solid var(--vscode-editorWarning-foreground);
        }
        .diff-summary-item.deleted {
            border-left: 3px solid var(--vscode-testing-iconFailed);
        }
        .state-change-group {
            margin-bottom: 18px;
        }
        .state-change-group h4 {
            margin-bottom: 8px;
        }
        .diff-row-created {
            background-color: color-mix(in srgb, var(--vscode-testing-iconPassed) 15%, transparent);
        }
        .diff-row-modified {
            background-color: color-mix(in srgb, var(--vscode-editorWarning-foreground) 15%, transparent);
        }
        .diff-row-deleted {
            background-color: color-mix(in srgb, var(--vscode-testing-iconFailed) 15%, transparent);
        }
    </style>
</head>
<body>
    <div class="status ${statusClass}">
        ${statusIcon} ${statusText}
    </div>

    <div class="section">
        <h3>Transaction Details</h3>
        <div class="export-actions" style="margin-bottom: 12px;">
            <button class="btn" onclick="exportAsJson()">Export as JSON</button>
            <button class="btn" onclick="exportAsCsv()">Export as CSV</button>
            <button class="btn" onclick="exportAsPdf()">Export as PDF</button>
        </div>
        <table>
            <tr><td>Contract ID:</td><td><code>${escapeHtml(contractId)}</code></td></tr>
            <tr><td>Function:</td><td><code>${escapeHtml(functionName)}</code></td></tr>
            <tr><td>Arguments:</td><td><pre>${escapeHtml(JSON.stringify(args, null, 2))}</pre></td></tr>
        </table>
    </div>

    ${validationWarningsHtml}
    ${
      result.success
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
                ${escapeHtml(result.error || "Unknown error occurred")}
            </div>
            ${errorMetadataHtml}
            ${suggestionsHtml}
        </div>
        `
    }

    ${stateDiffHtml}

    ${this._getChartsHtml(result)}
    <script>
        const vscode = acquireVsCodeApi();
        function exportStateDiff() {
            vscode.postMessage({ command: 'exportStateDiff' });
        }
        function exportAsJson() {
            vscode.postMessage({ command: 'exportAsJson' });
        }
        function exportAsCsv() {
            vscode.postMessage({ command: 'exportAsCsv' });
        }
        function exportAsPdf() {
            vscode.postMessage({ command: 'exportAsPdf' });
        }
        function exportChartAsPng(chartId) {
            const svgEl = document.getElementById(chartId);
            if (!svgEl) { return; }
            const svgData = new XMLSerializer().serializeToString(svgEl);
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            img.onload = function() {
                canvas.width = img.width * 2;
                canvas.height = img.height * 2;
                ctx.scale(2, 2);
                ctx.drawImage(img, 0, 0);
                const a = document.createElement('a');
                a.download = chartId + '.png';
                a.href = canvas.toDataURL('image/png');
                a.click();
            };
            img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
        }
    </script>
</body>
</html>`;
  }
}
