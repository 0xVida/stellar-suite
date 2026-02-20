// ============================================================
// src/ui/simulationDiffPanel.ts
// WebView panel for displaying simulation result diffs.
// Supports unified and side-by-side diff views with
// navigation and export capabilities.
// ============================================================

import * as vscode from 'vscode';
import { SimulationDiffService, SimulationDiff, DiffViewMode, DiffExportFormat } from '../services/simulationDiffService';
import { SimulationHistoryEntry } from '../services/simulationHistoryService';

/**
 * Panel for displaying simulation diff results.
 */
export class SimulationDiffPanel {
    public static currentPanel: SimulationDiffPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _diffService: SimulationDiffService;
    private _currentDiff: SimulationDiff | null = null;
    private _currentViewMode: DiffViewMode = 'unified';
    private _fromSimulation: SimulationHistoryEntry | null = null;
    private _toSimulation: SimulationHistoryEntry | null = null;

    /**
     * Create or show the diff panel.
     */
    public static createOrShow(context: vscode.ExtensionContext): SimulationDiffPanel {
        const column = vscode.ViewColumn.One;

        // If panel already exists, show it
        if (SimulationDiffPanel.currentPanel) {
            SimulationDiffPanel.currentPanel._panel.reveal(column);
            return SimulationDiffPanel.currentPanel;
        }

        // Create new panel
        const panel = vscode.window.createWebviewPanel(
            'stellarSuiteDiff',
            'Simulation Diff',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [],
            }
        );

        SimulationDiffPanel.currentPanel = new SimulationDiffPanel(panel, context);
        return SimulationDiffPanel.currentPanel;
    }

    private constructor(panel: vscode.WebviewPanel, private readonly _context: vscode.ExtensionContext) {
        this._panel = panel;
        this._diffService = new SimulationDiffService();

        // Set initial content
        this._panel.webview.html = this._getInitialHtml();

        // Handle panel disposal
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'toggleView':
                        this._currentViewMode = message.mode;
                        this._renderCurrentDiff();
                        break;
                    case 'export':
                        this._handleExport(message.format);
                        break;
                    case 'navigateToChange':
                        this._navigateToChange(message.index);
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    /**
     * Update the panel with a new diff.
     */
    public updateDiff(from: SimulationHistoryEntry, to: SimulationHistoryEntry): void {
        this._fromSimulation = from;
        this._toSimulation = to;
        this._currentDiff = this._diffService.calculateDiff(from, to);
        this._panel.title = `Diff: ${from.id} → ${to.id}`;
        this._renderCurrentDiff();
    }

    /**
     * Render the current diff
     */
    private _renderCurrentDiff(): void {
        if (!this._currentDiff) {
            this._panel.webview.html = this._getInitialHtml();
            return;
        }

        this._panel.webview.html = this._getDiffHtml(this._currentDiff, this._currentViewMode);
    }

    /**
     * Get initial HTML when no diff is loaded
     */
    private _getInitialHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Simulation Diff</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            text-align: center;
        }
        .placeholder {
            margin-top: 100px;
            opacity: 0.7;
        }
    </style>
</head>
<body>
    <div class="placeholder">
        <h2>No diff selected</h2>
        <p>Use the "Compare Simulations" command to generate a diff.</p>
    </div>
</body>
</html>`;
    }

    /**
     * Get HTML for diff display
     */
    private _getDiffHtml(diff: SimulationDiff, viewMode: DiffViewMode): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Simulation Diff</title>
    ${this._getStyles()}
</head>
<body>
    ${this._renderHeader(diff)}
    ${this._renderToolbar(viewMode)}
    ${this._renderSummary(diff)}
    ${this._renderNavigationBar(diff)}
    ${viewMode === 'side-by-side' ? this._renderSideBySide(diff) : this._renderUnified(diff)}
    ${this._getScripts()}
</body>
</html>`;
    }

    /**
     * Render header
     */
    private _renderHeader(diff: SimulationDiff): string {
        const severityClass = `severity-${diff.overallSeverity}`;
        return `
<div class="header">
    <h1>Simulation Diff</h1>
    <div class="header-info">
        <div class="info-row">
            <span class="label">From:</span>
            <span class="value">${this._escapeHtml(diff.fromId)}</span>
        </div>
        <div class="info-row">
            <span class="label">To:</span>
            <span class="value">${this._escapeHtml(diff.toId)}</span>
        </div>
        <div class="info-row">
            <span class="label">Generated:</span>
            <span class="value">${new Date(diff.generatedAt).toLocaleString()}</span>
        </div>
        <div class="info-row">
            <span class="label">Severity:</span>
            <span class="value ${severityClass}">${diff.overallSeverity}</span>
        </div>
        <div class="info-row">
            <span class="label">Changes:</span>
            <span class="value">${diff.hasChanges ? 'Yes' : 'No'}</span>
        </div>
    </div>
</div>`;
    }

    /**
     * Render toolbar
     */
    private _renderToolbar(viewMode: DiffViewMode): string {
        const unifiedActive = viewMode === 'unified' ? 'active' : '';
        const sideBySideActive = viewMode === 'side-by-side' ? 'active' : '';
        
        return `
<div class="toolbar">
    <div class="button-group">
        <button class="toolbar-btn ${unifiedActive}" onclick="toggleView('unified')">
            Unified View
        </button>
        <button class="toolbar-btn ${sideBySideActive}" onclick="toggleView('side-by-side')">
            Side-by-Side View
        </button>
    </div>
    <div class="button-group">
        <button class="toolbar-btn" onclick="exportDiff('json')">
            Export JSON
        </button>
        <button class="toolbar-btn" onclick="exportDiff('markdown')">
            Export Markdown
        </button>
        <button class="toolbar-btn" onclick="exportDiff('html')">
            Export HTML
        </button>
        <button class="toolbar-btn" onclick="exportDiff('unified')">
            Export Git Diff
        </button>
    </div>
</div>`;
    }

    /**
     * Render summary
     */
    private _renderSummary(diff: SimulationDiff): string {
        return `
<div class="summary">
    <h2>Summary</h2>
    <p>${this._escapeHtml(diff.summary)}</p>
    <div class="stats">
        <span class="stat">
            <strong>${diff.sections.filter(s => s.hasChanges).length}</strong> sections changed
        </span>
        <span class="stat">
            <strong>${diff.navigationPoints.length}</strong> change points
        </span>
    </div>
</div>`;
    }

    /**
     * Render navigation bar
     */
    private _renderNavigationBar(diff: SimulationDiff): string {
        if (diff.navigationPoints.length === 0) {
            return '<div class="navigation-bar"><p>No changes to navigate</p></div>';
        }

        const navItems = diff.navigationPoints.map((point, index) => {
            const severityClass = `severity-${point.severity}`;
            return `
<button class="nav-item ${severityClass}" onclick="navigateToChange(${index})">
    <span class="nav-section">${point.section}</span>
    <span class="nav-description">${this._escapeHtml(point.description)}</span>
</button>`;
        }).join('');

        return `
<div class="navigation-bar">
    <h3>Quick Navigation</h3>
    <div class="nav-items">
        ${navItems}
    </div>
</div>`;
    }

    /**
     * Render unified diff view
     */
    private _renderUnified(diff: SimulationDiff): string {
        let html = '<div class="diff-content unified-view">';

        for (const section of diff.sections) {
            html += `
<div class="section" id="section-${section.section}">
    <div class="section-header">
        <h3>${this._capitalizeFirst(section.section)}</h3>
        <span class="section-status ${section.hasChanges ? 'changed' : 'unchanged'}">
            ${section.hasChanges ? 'Changed' : 'Unchanged'}
        </span>
        <span class="severity-badge severity-${section.severity}">${section.severity}</span>
    </div>
    <div class="section-summary">${this._escapeHtml(section.summary)}</div>
    <div class="section-lines">`;

            for (const line of section.lines) {
                const lineClass = `line-${line.type}`;
                const severityClass = line.severity ? `severity-${line.severity}` : '';
                const prefix = 
                    line.type === 'added' ? '+ ' :
                    line.type === 'deleted' ? '- ' :
                    line.type === 'modified' ? '~ ' : '  ';
                
                html += `
<div class="diff-line ${lineClass} ${severityClass}">
    <span class="line-number">${line.lineNumber}</span>
    <span class="line-prefix">${prefix}</span>
    <span class="line-content">${this._escapeHtml(line.content)}</span>
</div>`;
            }

            html += `
    </div>
</div>`;
        }

        html += '</div>';
        return html;
    }

    /**
     * Render side-by-side diff view
     */
    private _renderSideBySide(diff: SimulationDiff): string {
        let html = '<div class="diff-content side-by-side-view">';

        for (const section of diff.sections) {
            html += `
<div class="section" id="section-${section.section}">
    <div class="section-header">
        <h3>${this._capitalizeFirst(section.section)}</h3>
        <span class="section-status ${section.hasChanges ? 'changed' : 'unchanged'}">
            ${section.hasChanges ? 'Changed' : 'Unchanged'}
        </span>
        <span class="severity-badge severity-${section.severity}">${section.severity}</span>
    </div>
    <div class="section-summary">${this._escapeHtml(section.summary)}</div>
    <div class="side-by-side-container">
        <div class="side side-old">
            <div class="side-header">From: ${this._escapeHtml(diff.fromId)}</div>
            <div class="side-content">`;

            // Render old (left) side
            for (const line of section.lines) {
                if (line.type === 'deleted' || line.type === 'modified' || line.type === 'unchanged') {
                    const content = line.oldContent || line.content;
                    const lineClass = line.type === 'deleted' ? 'line-deleted' : 
                                     line.type === 'modified' ? 'line-modified' : 'line-unchanged';
                    html += `
<div class="diff-line ${lineClass}">
    <span class="line-number">${line.lineNumber}</span>
    <span class="line-content">${this._escapeHtml(content)}</span>
</div>`;
                } else {
                    html += `<div class="diff-line line-empty"></div>`;
                }
            }

            html += `
            </div>
        </div>
        <div class="side side-new">
            <div class="side-header">To: ${this._escapeHtml(diff.toId)}</div>
            <div class="side-content">`;

            // Render new (right) side
            for (const line of section.lines) {
                if (line.type === 'added' || line.type === 'modified' || line.type === 'unchanged') {
                    const content = line.newContent || line.content;
                    const lineClass = line.type === 'added' ? 'line-added' : 
                                     line.type === 'modified' ? 'line-modified' : 'line-unchanged';
                    html += `
<div class="diff-line ${lineClass}">
    <span class="line-number">${line.lineNumber}</span>
    <span class="line-content">${this._escapeHtml(content)}</span>
</div>`;
                } else {
                    html += `<div class="diff-line line-empty"></div>`;
                }
            }

            html += `
            </div>
        </div>
    </div>
</div>`;
        }

        html += '</div>';
        return html;
    }

    /**
     * Get CSS styles
     */
    private _getStyles(): string {
        return `<style>
body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background-color: var(--vscode-editor-background);
    margin: 0;
    padding: 0;
}

.header {
    padding: 20px;
    background-color: var(--vscode-editor-background);
    border-bottom: 1px solid var(--vscode-panel-border);
}

.header h1 {
    margin: 0 0 15px 0;
    font-size: 24px;
    color: var(--vscode-foreground);
}

.header-info {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 10px;
}

.info-row {
    display: flex;
    gap: 10px;
}

.info-row .label {
    font-weight: bold;
    color: var(--vscode-descriptionForeground);
}

.info-row .value {
    color: var(--vscode-foreground);
}

.severity-critical {
    color: var(--vscode-errorForeground);
    font-weight: bold;
}

.severity-major {
    color: var(--vscode-editorWarning-foreground);
    font-weight: bold;
}

.severity-minor {
    color: var(--vscode-terminal-ansiGreen);
}

.toolbar {
    padding: 15px 20px;
    background-color: var(--vscode-editorWidget-background);
    border-bottom: 1px solid var(--vscode-panel-border);
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
}

.button-group {
    display: flex;
    gap: 5px;
}

.toolbar-btn {
    padding: 6px 12px;
    background-color: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: 1px solid var(--vscode-button-border);
    border-radius: 3px;
    cursor: pointer;
    font-size: 13px;
}

.toolbar-btn:hover {
    background-color: var(--vscode-button-secondaryHoverBackground);
}

.toolbar-btn.active {
    background-color: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
}

.summary {
    padding: 20px;
    background-color: var(--vscode-editor-background);
}

.summary h2 {
    margin: 0 0 10px 0;
    font-size: 18px;
}

.stats {
    display: flex;
    gap: 20px;
    margin-top: 10px;
}

.stat {
    color: var(--vscode-descriptionForeground);
}

.navigation-bar {
    padding: 15px 20px;
    background-color: var(--vscode-editorWidget-background);
    border-bottom: 1px solid var(--vscode-panel-border);
}

.navigation-bar h3 {
    margin: 0 0 10px 0;
    font-size: 14px;
    color: var(--vscode-descriptionForeground);
}

.nav-items {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.nav-item {
    padding: 8px 12px;
    background-color: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: 1px solid var(--vscode-button-border);
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
}

.nav-item:hover {
    background-color: var(--vscode-button-secondaryHoverBackground);
}

.nav-section {
    font-weight: bold;
    margin-bottom: 2px;
}

.nav-description {
    font-size: 11px;
    opacity: 0.8;
}

.diff-content {
    padding: 20px;
}

.section {
    margin-bottom: 30px;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    overflow: hidden;
}

.section-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 15px;
    background-color: var(--vscode-editorGroupHeader-tabsBackground);
    border-bottom: 1px solid var(--vscode-panel-border);
}

.section-header h3 {
    margin: 0;
    font-size: 16px;
    flex: 1;
}

.section-status {
    font-size: 12px;
    padding: 3px 8px;
    border-radius: 3px;
}

.section-status.changed {
    background-color: var(--vscode-editorWarning-background);
    color: var(--vscode-editorWarning-foreground);
}

.section-status.unchanged {
    background-color: var(--vscode-inputValidation-infoBackground);
    color: var(--vscode-inputValidation-infoForeground);
}

.severity-badge {
    font-size: 11px;
    padding: 3px 6px;
    border-radius: 3px;
    text-transform: uppercase;
    font-weight: bold;
}

.section-summary {
    padding: 10px 15px;
    background-color: var(--vscode-editor-background);
    font-style: italic;
    color: var(--vscode-descriptionForeground);
    border-bottom: 1px solid var(--vscode-panel-border);
}

.section-lines {
    background-color: var(--vscode-editor-background);
}

.diff-line {
    display: flex;
    align-items: center;
    padding: 2px 15px;
    font-family: var(--vscode-editor-font-family);
    font-size: var(--vscode-editor-font-size);
    line-height: 1.6;
}

.line-number {
    display: inline-block;
    width: 40px;
    color: var(--vscode-editorLineNumber-foreground);
    text-align: right;
    margin-right: 15px;
    user-select: none;
}

.line-prefix {
    margin-right: 8px;
    font-weight: bold;
}

.line-content {
    flex: 1;
    white-space: pre-wrap;
    word-break: break-word;
}

.line-added {
    background-color: var(--vscode-diffEditor-insertedTextBackground);
    color: var(--vscode-foreground);
}

.line-added .line-prefix {
    color: var(--vscode-terminal-ansiGreen);
}

.line-deleted {
    background-color: var(--vscode-diffEditor-removedTextBackground);
    color: var(--vscode-foreground);
}

.line-deleted .line-prefix {
    color: var(--vscode-errorForeground);
}

.line-modified {
    background-color: var(--vscode-diffEditor-insertedTextBackground);
    color: var(--vscode-foreground);
}

.line-modified .line-prefix {
    color: var(--vscode-editorWarning-foreground);
}

.line-unchanged {
    color: var(--vscode-foreground);
}

.side-by-side-container {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
}

.side {
    background-color: var(--vscode-editor-background);
}

.side-header {
    padding: 8px 15px;
    background-color: var(--vscode-editorGroupHeader-tabsBackground);
    border-bottom: 1px solid var(--vscode-panel-border);
    font-size: 12px;
    font-weight: bold;
    color: var(--vscode-descriptionForeground);
}

.side-old {
    border-right: 1px solid var(--vscode-panel-border);
}

.side-content {
    min-height: 100px;
}

.line-empty {
    min-height: 28px;
    background-color: var(--vscode-editor-background);
}

@media (max-width: 800px) {
    .side-by-side-container {
        grid-template-columns: 1fr;
    }
    
    .side-old {
        border-right: none;
        border-bottom: 1px solid var(--vscode-panel-border);
    }
}
</style>`;
    }

    /**
     * Get JavaScript for interactivity
     */
    private _getScripts(): string {
        return `<script>
const vscode = acquireVsCodeApi();

function toggleView(mode) {
    vscode.postMessage({
        command: 'toggleView',
        mode: mode
    });
}

function exportDiff(format) {
    vscode.postMessage({
        command: 'export',
        format: format
    });
}

function navigateToChange(index) {
    vscode.postMessage({
        command: 'navigateToChange',
        index: index
    });
    
    // Scroll to the corresponding section
    const navItems = document.querySelectorAll('.nav-item');
    if (navItems[index]) {
        const section = navItems[index].querySelector('.nav-section').textContent;
        const sectionElement = document.getElementById('section-' + section);
        if (sectionElement) {
            sectionElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
}
</script>`;
    }

    /**
     * Handle export request
     */
    private async _handleExport(format: DiffExportFormat): Promise<void> {
        if (!this._currentDiff) {
            vscode.window.showErrorMessage('No diff available to export');
            return;
        }

        try {
            const defaultUri = vscode.Uri.file(`simulation-diff-${this._currentDiff.fromId}-to-${this._currentDiff.toId}.${format}`);
            const fileUri = await vscode.window.showSaveDialog({
                defaultUri,
                filters: {
                    'JSON': ['json'],
                    'Markdown': ['md'],
                    'HTML': ['html'],
                    'Diff': ['diff', 'patch'],
                },
            });

            if (!fileUri) {
                return; // User cancelled
            }

            const exported = this._diffService.exportDiff(this._currentDiff, {
                format,
                includeFullData: true,
                viewMode: this._currentViewMode,
            });

            await vscode.workspace.fs.writeFile(fileUri, Buffer.from(exported, 'utf8'));
            vscode.window.showInformationMessage(`Diff exported to ${fileUri.fsPath}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to export diff: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Navigate to a specific change
     */
    private _navigateToChange(index: number): void {
        if (!this._currentDiff || index < 0 || index >= this._currentDiff.navigationPoints.length) {
            return;
        }

        const point = this._currentDiff.navigationPoints[index];
        vscode.window.showInformationMessage(
            `Navigating to ${point.section}: ${point.description}`
        );
    }

    /**
     * Dispose panel
     */
    public dispose(): void {
        SimulationDiffPanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    // ── Helper Methods ────────────────────────────────────────────

    private _escapeHtml(text: string): string {
        const map: Record<string, string> = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;',
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    private _capitalizeFirst(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}
