import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class ContractInvokeViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'stellarSuite.contractInvokeView';
    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
    ) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'invokeContract':
                    {
                        try {
                            vscode.window.showInformationMessage(`Invoking contract: ${data.contractId}`);
                            // Simple simulation of invocation using soroban-cli or generic exec
                            // In real environment, this would parse data.args as well
                            const { stdout, stderr } = await execAsync(`stellar contract invoke --id ${data.contractId} --network testnet --source default -- ${data.method} ${data.args || ''}`);
                            
                            this._view?.webview.postMessage({
                                type: 'invokeResult',
                                result: stdout || stderr
                            });
                        } catch (error: any) {
                            this._view?.webview.postMessage({
                                type: 'invokeError',
                                error: error.message || 'Unknown error occurred during invocation'
                            });
                        }
                        break;
                    }
            }
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Contract Invoke</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        padding: 10px;
                        color: var(--vscode-foreground);
                        background-color: var(--vscode-editor-background);
                    }
                    input, button {
                        width: 100%;
                        margin-bottom: 10px;
                        padding: 8px;
                        box-sizing: border-box;
                        background-color: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border: 1px solid var(--vscode-input-border);
                    }
                    button {
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        cursor: pointer;
                    }
                    button:hover {
                        background-color: var(--vscode-button-hoverBackground);
                    }
                    #output {
                        margin-top: 10px;
                        padding: 10px;
                        background-color: var(--vscode-editor-inactiveSelectionBackground);
                        white-space: pre-wrap;
                        min-height: 100px;
                        border: 1px solid var(--vscode-panel-border);
                    }
                    .error {
                        color: var(--vscode-errorForeground);
                    }
                </style>
            </head>
            <body>
                <h2>Invoke Contract</h2>
                <label for="contractId">Contract ID</label>
                <input type="text" id="contractId" placeholder="C...">
                
                <label for="method">Method</label>
                <input type="text" id="method" placeholder="hello">
                
                <label for="args">Arguments (Space separated)</label>
                <input type="text" id="args" placeholder="--arg value">
                
                <button id="invokeBtn">Invoke</button>
                
                <h3>Output:</h3>
                <div id="output">Results will appear here...</div>

                <script>
                    const vscode = acquireVsCodeApi();
                    
                    document.getElementById('invokeBtn').addEventListener('click', () => {
                        const contractId = document.getElementById('contractId').value;
                        const method = document.getElementById('method').value;
                        const args = document.getElementById('args').value;
                        
                        document.getElementById('output').innerText = 'Invoking...';
                        document.getElementById('output').classList.remove('error');
                        
                        vscode.postMessage({
                            type: 'invokeContract',
                            contractId: contractId,
                            method: method,
                            args: args
                        });
                    });

                    window.addEventListener('message', event => {
                        const message = event.data;
                        const outputDiv = document.getElementById('output');
                        
                        if (message.type === 'invokeResult') {
                            outputDiv.innerText = message.result;
                            outputDiv.classList.remove('error');
                        } else if (message.type === 'invokeError') {
                            outputDiv.innerText = message.error;
                            outputDiv.classList.add('error');
                        }
                    });
                </script>
            </body>
            </html>`;
    }
}
