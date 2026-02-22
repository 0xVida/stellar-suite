import * as vscode from 'vscode';
import { StateConflict, ConflictResolutionStrategy } from '../types/stateConflict';

export class ConflictResolutionPanel {
    public static currentPanel: ConflictResolutionPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'resolve':
                        this._onResolve(message.resolutions);
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    public static show(extensionUri: vscode.Uri, conflicts: StateConflict[]): Promise<Record<string, ConflictResolutionStrategy> | undefined> {
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

        if (ConflictResolutionPanel.currentPanel) {
            ConflictResolutionPanel.currentPanel._panel.reveal(column);
            ConflictResolutionPanel.currentPanel._update(conflicts);
            return Promise.resolve(undefined); // Already showing
        }

        const panel = vscode.window.createWebviewPanel(
            'conflictResolution',
            'State Conflict Resolution',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [extensionUri]
            }
        );

        ConflictResolutionPanel.currentPanel = new ConflictResolutionPanel(panel, extensionUri);
        ConflictResolutionPanel.currentPanel._update(conflicts);

        return new Promise((resolve) => {
            const disposable = panel.onDidDispose(() => {
                resolve(undefined);
                disposable.dispose();
            });

            // Note: This is a simplified version. In a real implementation, 
            // we'd emit an event and wait for the resolution message.
        });
    }

    private _onResolve(resolutions: Record<string, ConflictResolutionStrategy>): void {
        // Handle resolutions
        this.dispose();
    }

    private _update(conflicts: StateConflict[]): void {
        this._panel.webview.html = this._getHtmlForWebview(conflicts);
    }

    public dispose(): void {
        ConflictResolutionPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _getHtmlForWebview(conflicts: StateConflict[]): string {
        const rows = conflicts.map(c => `
            <div class="conflict-row">
                <div class="path">Path: ${c.path}</div>
                <div class="values">
                    <div class="local">
                        <h3>Local Version</h3>
                        <pre>${JSON.stringify(c.localValue, null, 2)}</pre>
                        <button onclick="resolve('${c.path}', 'local_wins')">Keep Local</button>
                    </div>
                    <div class="remote">
                        <h3>Remote Version</h3>
                        <pre>${JSON.stringify(c.remoteValue, null, 2)}</pre>
                        <button onclick="resolve('${c.path}', 'remote_wins')">Keep Remote</button>
                    </div>
                </div>
            </div>
        `).join('<hr>');

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 20px; }
                    .conflict-row { margin-bottom: 20px; border: 1px solid var(--vscode-widget-border); padding: 10px; border-radius: 4px; }
                    .path { font-weight: bold; margin-bottom: 10px; font-size: 1.1em; color: var(--vscode-editor-foreground); }
                    .values { display: flex; gap: 20px; }
                    .local, .remote { flex: 1; border: 1px solid var(--vscode-panel-border); padding: 10px; background: var(--vscode-editor-background); }
                    pre { white-space: pre-wrap; word-wrap: break-word; font-size: 12px; }
                    button { margin-top: 10px; padding: 5px 10px; cursor: pointer; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 2px; }
                    button:hover { background: var(--vscode-button-hoverBackground); }
                </style>
                <title>State Conflict Resolution</title>
            </head>
            <body>
                <h1>State Conflict Resolution</h1>
                <p>Conflicting changes were detected in the workspace state. Please select which versions to keep.</p>
                <div id="conflicts-container">
                    ${rows}
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    const resolutions = {};

                    function resolve(path, strategy) {
                        resolutions[path] = strategy;
                        // For a simple demo: just resolve immediately on first choice
                        // In a real app, gather all and hit "Apply"
                        vscode.postMessage({
                            command: 'resolve',
                            resolutions: resolutions
                        });
                    }
                </script>
            </body>
            </html>`;
    }
}
