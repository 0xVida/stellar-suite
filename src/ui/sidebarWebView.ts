import * as vscode from 'vscode';
import { ContractInfo, DeploymentRecord } from './sidebarView';

export class SidebarWebView {
    private webview: vscode.Webview;

    constructor(webview: vscode.Webview, private readonly extensionUri: vscode.Uri) {
        this.webview = webview;
    }

    public updateContent(contracts: ContractInfo[], deployments: DeploymentRecord[]) {
        const html = this.getHtml(contracts, deployments);
        this.webview.html = html;
    }

    private getHtml(contracts: ContractInfo[], deployments: DeploymentRecord[]): string {
        const contractsHtml = this.renderContracts(contracts);
        const deploymentsHtml = this.renderDeployments(deployments);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Stellar Suite</title>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
            padding: 12px;
            line-height: 1.5;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--vscode-sideBar-border);
        }
        .header h2 {
            font-size: 14px;
            font-weight: 600;
        }
        .refresh-btn {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            padding: 4px 12px;
            border-radius: 2px;
            cursor: pointer;
            font-size: 12px;
        }
        .refresh-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .section {
            margin-bottom: 24px;
        }
        .section-title {
            font-size: 12px;
            font-weight: 600;
            margin-bottom: 8px;
            color: var(--vscode-foreground);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .contract-item, .deployment-item {
            background: var(--vscode-list-inactiveSelectionBackground);
            border: 1px solid var(--vscode-sideBar-border);
            border-radius: 4px;
            padding: 12px;
            margin-bottom: 8px;
            cursor: pointer;
            transition: background 0.2s;
            overflow: hidden;
            word-wrap: break-word;
        }
        .contract-item:hover, .deployment-item:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .contract-name {
            font-weight: 600;
            font-size: 13px;
            margin-bottom: 4px;
            color: var(--vscode-textLink-foreground);
            word-break: break-all;
            overflow-wrap: break-word;
        }
        .contract-path {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 8px;
            word-break: break-all;
        }
        .contract-id {
            font-size: 11px;
            font-family: var(--vscode-editor-font-family);
            color: var(--vscode-textLink-foreground);
            margin-bottom: 8px;
            word-break: break-all;
        }
        .contract-actions {
            display: flex;
            gap: 8px;
            margin-top: 8px;
        }
        .btn {
            padding: 4px 8px;
            border: none;
            border-radius: 2px;
            cursor: pointer;
            font-size: 11px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .btn:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .btn-secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .status-badge {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 2px;
            font-size: 10px;
            font-weight: 600;
            margin-left: 8px;
        }
        .status-deployed {
            background: var(--vscode-testing-iconPassed);
            color: var(--vscode-editor-background);
        }
        .status-not-deployed {
            background: var(--vscode-descriptionForeground);
            color: var(--vscode-editor-background);
        }
        .status-version {
            background: rgba(180,120,255,0.25);
            color: #c792ea;
        }
        .status-mismatch {
            background: rgba(241,76,76,0.15);
            color: var(--vscode-errorForeground, #f14c4c);
        }
        .functions-list {
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px solid var(--vscode-sideBar-border);
        }
        .function-item {
            font-size: 11px;
            padding: 4px 0;
            color: var(--vscode-descriptionForeground);
        }
        .function-name {
            font-weight: 600;
            color: var(--vscode-foreground);
        }
        .empty-state {
            text-align: center;
            padding: 24px;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
        }
        .timestamp {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h2>Stellar Suite</h2>
        <button class="refresh-btn" onclick="refresh()">Refresh</button>
    </div>

    <div class="section">
        <div class="section-title">Contracts</div>
        ${contractsHtml}
    </div>

    <div class="section">
        <div class="section-title">Deployments</div>
        ${deploymentsHtml}
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }
        
        function deploy(contractPath) {
            console.log('Deploy clicked for:', contractPath);
            vscode.postMessage({ command: 'deploy', contractPath: contractPath });
        }
        
        function build(contractPath) {
            console.log('Build clicked for:', contractPath);
            vscode.postMessage({ command: 'build', contractPath: contractPath });
        }
        
        function simulate(contractId) {
            vscode.postMessage({ command: 'simulate', contractId: contractId });
        }
        
        function inspectContract(contractId) {
            vscode.postMessage({ command: 'inspectContract', contractId: contractId });
        }
    </script>
</body>
</html>`;
    }

    private renderContracts(contracts: ContractInfo[]): string {
        if (contracts.length === 0) {
            return '<div class="empty-state">No contracts detected in workspace</div>';
        }

        return contracts.map(contract => {
            const statusClass = contract.contractId ? 'status-deployed' : 'status-not-deployed';
            const statusText = contract.contractId ? 'Deployed' : 'Not Deployed';

            // hasWasm mirrors isBuilt — fall back to isBuilt if hasWasm not populated
            const isBuilt = contract.hasWasm ?? contract.isBuilt;
            const buildStatus = isBuilt ? 'Built' : 'Not Built';
            const buildStatusClass = isBuilt ? 'status-deployed' : 'status-not-deployed';

            const functionsHtml = contract.functions && contract.functions.length > 0
                ? `<div class="functions-list">
                    ${contract.functions.map(fn => `
                        <div class="function-item">
                            <span class="function-name">${this.escapeHtml(fn.name)}</span>
                            ${fn.parameters.length > 0
                                ? `(${fn.parameters.map(p => this.escapeHtml(p.name)).join(', ')})`
                                : '()'}
                        </div>
                    `).join('')}
                   </div>`
                : '';

            const deployedAt = contract.lastDeployed ?? contract.deployedAt;

            const localVersion    = contract.localVersion;
            const deployedVersion = contract.deployedVersion;
            const hasMismatch     = contract.hasVersionMismatch;

            return `
                <div class="contract-item">
                    <div class="contract-name">
                        ${this.escapeHtml(contract.name)}
                        <span class="status-badge ${statusClass}">${statusText}</span>
                        <span class="status-badge ${buildStatusClass}">${buildStatus}</span>
                        ${localVersion ? `<span class="status-badge status-version">v${this.escapeHtml(localVersion)}</span>` : ''}
                        ${hasMismatch  ? `<span class="status-badge status-mismatch">⚠ Mismatch</span>` : ''}
                    </div>
                    <div class="contract-path">${this.escapeHtml(contract.path)}</div>
                    ${deployedVersion
                        ? `<div class="timestamp">Deployed version: <strong>v${this.escapeHtml(deployedVersion)}</strong></div>`
                        : ''}
                    ${hasMismatch && contract.versionMismatchMessage
                        ? `<div class="timestamp" style="color:var(--vscode-errorForeground)">⚠ ${this.escapeHtml(contract.versionMismatchMessage)}</div>`
                        : ''}
                    ${contract.contractId
                        ? `<div class="contract-id">ID: ${this.escapeHtml(contract.contractId)}</div>`
                        : ''}
                    ${deployedAt
                        ? `<div class="timestamp">Deployed: ${new Date(deployedAt).toLocaleString()}</div>`
                        : ''}
                    ${functionsHtml}
                    <div class="contract-actions">
                        <button class="btn" onclick="build('${this.escapeHtml(contract.path)}')">Build</button>
                        ${isBuilt
                            ? `<button class="btn" onclick="deploy('${this.escapeHtml(contract.path)}')">Deploy</button>`
                            : ''}
                        ${contract.contractId
                            ? `<button class="btn btn-secondary" onclick="simulate('${this.escapeHtml(contract.contractId)}')">Simulate</button>`
                            : ''}
                        ${contract.contractId
                            ? `<button class="btn btn-secondary" onclick="inspectContract('${this.escapeHtml(contract.contractId)}')">Inspect</button>`
                            : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    private renderDeployments(deployments: DeploymentRecord[]): string {
        if (deployments.length === 0) {
            return '<div class="empty-state">No deployments yet</div>';
        }

        return deployments.map(deployment => {
            const date = new Date(deployment.deployedAt);
            return `
                <div class="deployment-item">
                    <div class="contract-id">Contract ID: ${this.escapeHtml(deployment.contractId)}</div>
                    <div class="timestamp">${date.toLocaleString()}</div>
                    <div class="timestamp">Network: ${this.escapeHtml(deployment.network)} | Source: ${this.escapeHtml(deployment.source)}</div>
                </div>
            `;
        }).join('');
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}

//ignore comme