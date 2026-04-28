import * as vscode from 'vscode';

export class AccountBalanceViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'stellarSuite.accountBalanceView';
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
                case 'refreshBalance':
                    {
                        try {
                            const publicKey = data.publicKey;
                            if (!publicKey) {
                                throw new Error('Public key is required');
                            }
                            
                            // Fetch account data from Horizon testnet
                            const response = await fetch(`https://horizon-testnet.stellar.org/accounts/${publicKey}`);
                            if (!response.ok) {
                                throw new Error('Account not found or network error');
                            }
                            
                            const accountData = await response.json();
                            
                            // Fetch recent transactions
                            const txResponse = await fetch(`https://horizon-testnet.stellar.org/accounts/${publicKey}/transactions?limit=5&order=desc`);
                            const txData = await txResponse.json();
                            
                            this._view?.webview.postMessage({
                                type: 'balanceResult',
                                balances: accountData.balances,
                                transactions: txData._embedded.records
                            });
                        } catch (error: any) {
                            this._view?.webview.postMessage({
                                type: 'error',
                                error: error.message || 'Unknown error occurred'
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
                <title>Account Balance</title>
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
                    .balance-card, .tx-card {
                        background-color: var(--vscode-editor-inactiveSelectionBackground);
                        padding: 10px;
                        margin-bottom: 10px;
                        border-radius: 4px;
                        border: 1px solid var(--vscode-panel-border);
                    }
                    .asset-code {
                        font-weight: bold;
                    }
                    .asset-balance {
                        float: right;
                    }
                    .tx-hash {
                        font-family: monospace;
                        font-size: 0.9em;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    }
                    a {
                        color: var(--vscode-textLink-foreground);
                        text-decoration: none;
                    }
                    a:hover {
                        text-decoration: underline;
                    }
                    .error {
                        color: var(--vscode-errorForeground);
                        padding: 10px;
                    }
                </style>
            </head>
            <body>
                <h2>Account Info</h2>
                <label for="publicKey">Public Key (G...)</label>
                <input type="text" id="publicKey" placeholder="GA...">
                
                <button id="refreshBtn">Check Balance & History</button>
                
                <div id="error" class="error" style="display: none;"></div>
                
                <h3>Balances</h3>
                <div id="balancesList">Enter a public key to view balances.</div>
                
                <h3>Recent Transactions</h3>
                <div id="transactionsList">No transactions to display.</div>

                <script>
                    const vscode = acquireVsCodeApi();
                    
                    document.getElementById('refreshBtn').addEventListener('click', () => {
                        const publicKey = document.getElementById('publicKey').value;
                        
                        document.getElementById('balancesList').innerText = 'Loading...';
                        document.getElementById('transactionsList').innerText = 'Loading...';
                        document.getElementById('error').style.display = 'none';
                        
                        vscode.postMessage({
                            type: 'refreshBalance',
                            publicKey: publicKey
                        });
                    });

                    window.addEventListener('message', event => {
                        const message = event.data;
                        
                        if (message.type === 'balanceResult') {
                            // Render Balances
                            const balancesList = document.getElementById('balancesList');
                            balancesList.innerHTML = '';
                            
                            if (message.balances && message.balances.length > 0) {
                                message.balances.forEach(b => {
                                    const isNative = b.asset_type === 'native';
                                    const code = isNative ? 'XLM' : b.asset_code;
                                    
                                    balancesList.innerHTML += \`
                                        <div class="balance-card">
                                            <span class="asset-code">\${code}</span>
                                            <span class="asset-balance">\${b.balance}</span>
                                        </div>
                                    \`;
                                });
                            } else {
                                balancesList.innerText = 'No balances found.';
                            }
                            
                            // Render Transactions
                            const txList = document.getElementById('transactionsList');
                            txList.innerHTML = '';
                            
                            if (message.transactions && message.transactions.length > 0) {
                                message.transactions.forEach(tx => {
                                    const date = new Date(tx.created_at).toLocaleDateString();
                                    txList.innerHTML += \`
                                        <div class="tx-card">
                                            <div><strong>\${date}</strong></div>
                                            <div class="tx-hash">
                                                <a href="https://stellar.expert/explorer/testnet/tx/\${tx.id}" target="_blank">
                                                    \${tx.id.substring(0, 16)}...
                                                </a>
                                            </div>
                                            <div>Successful: \${tx.successful ? '✅' : '❌'}</div>
                                        </div>
                                    \`;
                                });
                            } else {
                                txList.innerText = 'No recent transactions.';
                            }
                            
                        } else if (message.type === 'error') {
                            const errorDiv = document.getElementById('error');
                            errorDiv.innerText = message.error;
                            errorDiv.style.display = 'block';
                            document.getElementById('balancesList').innerText = '';
                            document.getElementById('transactionsList').innerText = '';
                        }
                    });
                </script>
            </body>
            </html>`;
    }
}
