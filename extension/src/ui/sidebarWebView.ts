import * as vscode from 'vscode';
import { ContractInfo, DeploymentRecord } from './sidebarView';

export class SidebarWebView {
    private webview: vscode.Webview;

    constructor(webview: vscode.Webview, private readonly extensionUri: vscode.Uri) {
        this.webview = webview;
    }

    public updateContent(contracts: ContractInfo[], deployments: DeploymentRecord[], isCliInstalled: boolean = false) {
        const html = this.getHtml(contracts, deployments, isCliInstalled);
        this.webview.html = html;
    }

    private getHtml(contracts: ContractInfo[], deployments: DeploymentRecord[], isCliInstalled: boolean): string {
        const contractsHtml = this.renderContracts(contracts);
        const deploymentsHtml = this.renderDeployments(deployments);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Stellar Kit</title>
    <style>
        :root {
            --brand-bg: hsl(222, 47%, 6%);
            --brand-primary: hsl(228, 76%, 60%);
            --brand-secondary: hsl(217.2, 32.6%, 17.5%);
            --brand-foreground: hsl(210, 40%, 96%);
            --brand-border: hsl(217.2, 32.6%, 17.5%);
        }

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
            color: var(--brand-primary);
        }
        .refresh-btn {
            background: var(--brand-secondary);
            color: var(--brand-foreground);
            border: 1px solid var(--brand-border);
            padding: 6px 12px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 11px;
            transition: all 0.2s;
        }
        .refresh-btn:hover {
            background: var(--brand-primary);
            color: white;
            transform: translateY(-1px);
        }
        .section {
            margin-bottom: 24px;
        }
        .section-title {
            font-size: 11px;
            font-weight: 700;
            margin-bottom: 10px;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            letter-spacing: 1px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .section-title-text {
            flex: 1;
        }
        .clear-btn {
            background: transparent;
            color: var(--vscode-descriptionForeground);
            border: 1px solid var(--vscode-input-border);
            padding: 4px 8px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 10px;
            transition: all 0.2s;
        }
        .clear-btn:hover {
            border-color: var(--brand-primary);
            color: var(--brand-primary);
        }
        .filter-bar {
            display: flex;
            gap: 8px;
            margin-bottom: 12px;
            flex-wrap: wrap;
        }
        .filter-input {
            flex: 1;
            min-width: 120px;
            padding: 7px 10px;
            border: 1px solid var(--vscode-input-border);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 6px;
            font-size: 11px;
        }
        .filter-input:focus {
            outline: none;
            border-color: var(--brand-primary);
        }
        .filter-select {
            padding: 6px 8px;
            border: 1px solid var(--vscode-input-border);
            background: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border-radius: 6px;
            font-size: 11px;
        }
        .wasm-size {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin: 2px 0;
            font-family: var(--vscode-editor-font-family);
        }
        .contract-item, .deployment-item {
            background: var(--vscode-sideBar-background);
            border: 1px solid var(--vscode-sideBar-border);
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 10px;
            transition: all 0.2s;
            overflow: hidden;
            word-wrap: break-word;
        }
        .contract-item:hover, .deployment-item:hover {
            border-color: var(--brand-primary);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
        .contract-name {
            font-weight: 700;
            font-size: 13px;
            margin-bottom: 6px;
            color: var(--brand-primary);
            word-break: break-all;
            overflow-wrap: break-word;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .contract-path {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 10px;
            word-break: break-all;
            opacity: 0.8;
        }
        .contract-id {
            font-size: 10px;
            font-family: 'JetBrains Mono', var(--vscode-editor-font-family);
            background: var(--brand-bg);
            color: var(--brand-primary);
            padding: 4px 8px;
            border-radius: 4px;
            margin-bottom: 10px;
            word-break: break-all;
            border: 1px solid var(--brand-border);
        }
        .contract-actions {
            display: flex;
            gap: 6px;
            margin-top: 10px;
            flex-wrap: wrap;
        }
        .btn {
            padding: 8px 14px;
            border: 1px solid var(--brand-primary);
            border-radius: 8px;
            cursor: pointer;
            font-size: 11px;
            font-weight: 600;
            background: var(--brand-primary);
            color: white;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }
        .btn:hover {
            opacity: 0.9;
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
        }
        .btn-secondary {
            background: var(--brand-bg);
            color: var(--brand-primary);
            border: 1px solid var(--brand-primary);
        }
        .btn-secondary:hover {
            background: var(--brand-primary);
            color: white;
        }
        .status-badge-success {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 9px;
            font-weight: 700;
            text-transform: uppercase;
            background: rgba(34, 197, 94, 0.2);
            color: #22c55e;
            border: 1px solid rgba(34, 197, 94, 0.2);
        }
        .empty-state {
            text-align: center;
            padding: 32px 16px;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
            font-style: italic;
        }
        .timestamp {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            margin-top: 6px;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        #cli-history {
            max-height: 250px;
            overflow-y: auto;
            border-radius: 8px;
            background: var(--brand-bg);
            border: 1px solid var(--brand-border);
            padding: 8px;
        }
        .cli-entry {
            padding: 8px;
            border-bottom: 1px solid var(--brand-border);
            font-size: 11px;
        }
        .cli-entry:last-child {
            border-bottom: none;
        }
        .cli-command {
            font-family: 'JetBrains Mono', var(--vscode-editor-font-family);
            color: var(--brand-primary);
            word-break: break-all;
        }
        .cli-timestamp {
            font-size: 9px;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
            opacity: 0.7;
        }
        .clipboard-copy {
            cursor: pointer;
            transition: all 0.2s;
        }
        .clipboard-copy:hover {
            background: var(--brand-secondary);
            border-color: var(--brand-primary);
        }
        .icon-btn:hover {
            background: var(--brand-secondary);
            transform: translateY(-1px);
        }
    </style>
</head>
<body>
    <div class="header" style="flex-direction: column; align-items: stretch; gap: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <h2>Kit Studio</h2>
            <button class="refresh-btn" onclick="refresh()">Refresh</button>
        </div>
        <div style="font-size: 11px; padding: 6px 8px; border-radius: 4px; background: ${isCliInstalled ? 'var(--vscode-testing-iconPassed)' : 'var(--vscode-errorForeground)'}; color: var(--vscode-editor-background); display: flex; justify-content: space-between; align-items: center; font-weight: 600;">
            <span style="display: flex; align-items: center; gap: 6px;">
                Stellar CLI: ${isCliInstalled ? 'Installed' : 'Not Found'}
            </span>
            ${!isCliInstalled ? `<button onclick="installCli()" style="background: transparent; border: 1px solid currentColor; color: inherit; padding: 2px 6px; border-radius: 3px; cursor: pointer; font-size: 10px;">Install</button>` : ''}
        </div>
    </div>

    <div class="section">
        <div class="section-title">Quick Actions</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <button class="btn btn-secondary" style="width: 100%; text-align: left; display: flex; align-items: center; gap: 6px;" onclick="executeCommand('stellarSuite.switchNetwork')">Switch Network</button>
            <button class="btn btn-secondary" style="width: 100%; text-align: left; display: flex; align-items: center; gap: 6px;" onclick="executeCommand('stellarSuite.keysGenerate')">Create Identity</button>
            <button class="btn btn-secondary" style="width: 100%; text-align: left; display: flex; align-items: center; gap: 6px;" onclick="executeCommand('stellarSuite.keysList')">Identities</button>
            <button class="btn btn-secondary" style="width: 100%; text-align: left; display: flex; align-items: center; gap: 6px;" onclick="executeCommand('stellarSuite.keysFund')">Fund Account</button>
            <button class="btn btn-secondary" style="width: 100%; text-align: left; display: flex; align-items: center; gap: 6px;" onclick="executeCommand('stellarSuite.simulateFromSidebar')">Simulate Tx</button>
            <button class="btn btn-secondary" style="width: 100%; text-align: left; display: flex; align-items: center; gap: 6px;" onclick="executeCommand('stellarSuite.runInvoke')">Run Tx</button>
        </div>
    </div>

    <div class="section">
        <div class="section-title">Filters</div>
        <div class="filter-bar">
            <input type="text" id="search-filter" placeholder="Search contracts..." class="filter-input" oninput="applyFilters()">
            <select id="build-filter" class="filter-select" onchange="applyFilters()">
                <option value="">All Build Status</option>
                <option value="built">Built</option>
                <option value="not-built">Not Built</option>
            </select>
            <select id="deploy-filter" class="filter-select" onchange="applyFilters()">
                <option value="">All Deploy Status</option>
                <option value="deployed">Deployed</option>
                <option value="not-deployed">Not Deployed</option>
            </select>
        </div>
    </div>

    <div class="section">
        <div class="section-title">Contracts</div>
        <div id="contracts-list">
            ${contractsHtml}
        </div>
    </div>

    <div class="section">
        <div class="section-title">
            <span class="section-title-text">Deployments</span>
            <button class="clear-btn" onclick="clearDeployments()">Clear</button>
        </div>
        ${deploymentsHtml}
    </div>

    <div class="section">
        <div class="section-title">CLI History</div>
        <div id="cli-history" class="empty-state">No CLI history yet</div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }
        
        function installCli() {
            vscode.postMessage({ command: 'installCli' });
        }
        
        function deploy(contractPath) {
            vscode.postMessage({ command: 'deploy', contractPath: contractPath });
        }
        
        function build(contractPath) {
            vscode.postMessage({ command: 'build', contractPath: contractPath });
        }
        
        function buildOptimized(contractPath) {
            vscode.postMessage({ command: 'execute', executeCommand: 'stellarSuite.buildContract', args: { contractPath: contractPath, optimize: true } });
        }
        
        function copyToClipboard(text) {
            vscode.postMessage({ command: 'copyToClipboard', text: text });
        }
        
        function simulate(contractId, functionName) {
            vscode.postMessage({ command: 'simulate', contractId: contractId, functionName: functionName });
        }
        
        function inspectContract(contractId) {
            vscode.postMessage({ command: 'inspectContract', contractId: contractId });
        }
        
        function runInvoke(contractId, functionName) {
            vscode.postMessage({ command: 'runInvoke', contractId: contractId, functionName: functionName });
        }

        function contractInfo(contractId) {
            vscode.postMessage({ command: 'contractInfo', contractId: contractId });
        }
        
        function copyId(id) {
            copyToClipboard(id);
        }
        
        function executeCommand(cmd, args) {
            vscode.postMessage({ command: 'execute', executeCommand: cmd, args: args });
        }
        
        function clearDeployments() {
            vscode.postMessage({ command: 'clearDeployments' });
        }

        function applyFilters() {
            const search = document.getElementById('search-filter').value.toLowerCase();
            const buildFilter = document.getElementById('build-filter').value;
            const deployFilter = document.getElementById('deploy-filter').value;
            
            const contracts = document.querySelectorAll('.contract-item');
            contracts.forEach(contract => {
                const name = contract.querySelector('.contract-name')?.textContent?.toLowerCase() || '';
                const path = contract.querySelector('.contract-path')?.textContent?.toLowerCase() || '';
                const matchesSearch = !search || name.includes(search) || path.includes(search);
                
                const actionsEl = contract.querySelector('.contract-actions');
                const isBuilt = actionsEl?.getAttribute('data-is-built') === 'true' || 
                               contract.querySelector('.status-badge-success') !== null;
                
                const matchesBuild = !buildFilter || 
                    (buildFilter === 'built' && isBuilt) || 
                    (buildFilter === 'not-built' && !isBuilt);
                
                const hasContractId = contract.querySelector('.contract-id') !== null;
                const matchesDeploy = !deployFilter || 
                    (deployFilter === 'deployed' && hasContractId) || 
                    (deployFilter === 'not-deployed' && !hasContractId);
                
                if (matchesSearch && matchesBuild && matchesDeploy) {
                    contract.style.display = '';
                } else {
                    contract.style.display = 'none';
                }
            });
        }

        function loadCliHistory() {
            vscode.postMessage({ command: 'getCliHistory' });
        }

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'cliHistory:data') {
                const historyEl = document.getElementById('cli-history');
                if (message.history && message.history.length > 0) {
                    historyEl.innerHTML = message.history.map(function(entry) {
                        const cmd = escapeHtml(entry.command || entry);
                        const ts = entry.timestamp ? '<div class="cli-timestamp">' + new Date(entry.timestamp).toLocaleString() + '</div>' : '';
                        return '<div class="cli-entry"><div class="cli-command">' + cmd + '</div>' + ts + '</div>';
                    }).join('');
                } else {
                    historyEl.innerHTML = '<div class="empty-state">No CLI history yet</div>';
                }
            }
        });

        function escapeHtml(text) {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        loadCliHistory();
    </script>
</body>
</html>`;
    }

    private renderContracts(contracts: ContractInfo[]): string {
        if (contracts.length === 0) {
            return '<div class="empty-state">No contracts detected in workspace</div>';
        }

        return contracts.map(contract => {
            const buildStatusBadge = contract.hasWasm
                ? '<span class="status-badge-success">Built</span>'
                : '';
            const functionsHtml = '';
            const sizeInfo = contract.wasmSizeFormatted 
                ? `<div class="wasm-size">Size: ${this.escapeHtml(contract.wasmSizeFormatted)}</div>`
                : '';

            return `
                <div class="contract-item">
                    <div class="contract-name">
                        ${this.escapeHtml(contract.name)}
                        ${buildStatusBadge}
                    </div>
                    <div class="contract-path">${this.escapeHtml(contract.path)}</div>
                    ${sizeInfo}
                    ${contract.contractId ? `<div class="contract-id clipboard-copy" onclick="copyToClipboard('${this.escapeHtml(contract.contractId)}')" title="Click to copy Contract ID">ID: ${this.escapeHtml(contract.contractId)} <span style="font-size: 10px; opacity: 0.7;">[COPY]</span></div>` : ''}
                    ${contract.lastDeployed ? `<div class="timestamp">Deployed: ${new Date(contract.lastDeployed).toLocaleString()}</div>` : ''}
                    ${functionsHtml}
                    <div class="contract-actions" data-is-built="${contract.hasWasm}">
                        <button class="btn" onclick="build('${this.escapeHtml(contract.path)}')">Build</button>
                        ${contract.hasWasm ? `<button class="btn" onclick="deploy('${this.escapeHtml(contract.path)}')">Deploy</button>` : ''}
                        ${contract.contractId ? `<button class="btn btn-secondary" onclick="simulate('${this.escapeHtml(contract.contractId)}')">Simulate</button>` : ''}
                        ${contract.contractId ? `<button class="btn btn-secondary" onclick="runInvoke('${this.escapeHtml(contract.contractId)}')">Run</button>` : ''}
                        ${contract.contractId ? `<button class="btn btn-secondary" onclick="contractInfo('${this.escapeHtml(contract.contractId)}')">Info</button>` : ''}
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
                    <div class="contract-id clipboard-copy" onclick="copyToClipboard('${this.escapeHtml(deployment.contractId)}')" title="Click to copy Contract ID">
                        Contract ID: ${this.escapeHtml(deployment.contractId)} <span style="font-size: 10px;">[COPY]</span>
                    </div>
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
