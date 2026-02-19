import * as vscode from 'vscode';
import { ContractInfo, DeploymentInfo } from './sidebarView';
import { GroupHierarchy } from '../services/contractGroupService';

export interface SidebarContent {
    contracts: ContractInfo[];
    deployments: DeploymentInfo[];
    groups?: GroupHierarchy[];
}

export class SidebarWebView {
    private webview: vscode.Webview;

    constructor(webview: vscode.Webview, private readonly extensionUri: vscode.Uri) {
        this.webview = webview;
    }

    public updateContent(contracts: ContractInfo[], deployments: DeploymentInfo[], groups?: GroupHierarchy[]) {
        const html = this.getHtml(contracts, deployments, groups);
        this.webview.html = html;
    }

    private getHtml(contracts: ContractInfo[], deployments: DeploymentInfo[], groups?: GroupHierarchy[]): string {
        const contractsHtml = groups ? this.renderGroupsWithContracts(groups, contracts) : this.renderContracts(contracts);
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
        .group-header {
            display: flex;
            align-items: center;
            padding: 8px 12px;
            margin-bottom: 8px;
            font-weight: 600;
            font-size: 12px;
            cursor: pointer;
            user-select: none;
            gap: 6px;
        }
        .group-header:hover {
            background: var(--vscode-list-hoverBackground);
            border-radius: 2px;
        }
        .group-chevron {
            display: inline-block;
            width: 16px;
            height: 16px;
            text-align: center;
            line-height: 16px;
            font-size: 12px;
            transition: transform 0.2s;
        }
        .group-chevron.collapsed {
            transform: rotate(-90deg);
        }
        .group-content {
            margin-left: 12px;
            border-left: 1px solid var(--vscode-sideBar-border);
            padding-left: 12px;
            margin-bottom: 8px;
        }
        .group-stats {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            margin-left: 4px;
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
            flex-wrap: wrap;
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
        .group-actions {
            display: flex;
            gap: 4px;
            margin-left: auto;
        }
        .group-btn {
            padding: 2px 6px;
            border: none;
            border-radius: 2px;
            cursor: pointer;
            font-size: 10px;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .group-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
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
        let draggedElement = null;
        let draggedContractPath = null;
        let targetGroupId = null;
        
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

        function toggleGroup(groupId) {
            vscode.postMessage({ command: 'toggleGroupCollapse', groupId: groupId });
        }

        function renameGroup(groupId) {
            vscode.postMessage({ command: 'renameGroup', groupId: groupId });
        }

        function deleteGroup(groupId) {
            vscode.postMessage({ command: 'deleteGroup', groupId: groupId });
        }

        function createGroup(parentGroupId) {
            vscode.postMessage({ command: 'createGroup', parentGroupId: parentGroupId });
        }

        // Drag and drop support for contracts
        document.addEventListener('dragstart', (e) => {
            if (e.target?.classList.contains('contract-item')) {
                draggedElement = e.target;
                draggedContractPath = e.target.querySelector('.contract-path')?.textContent?.trim();
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('application/x-contract', draggedContractPath);
            }
        });

        document.addEventListener('dragover', (e) => {
            if (e.dataTransfer.types.includes('application/x-contract')) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const target = e.target?.closest('.group-content, .group-header');
                if (target) {
                    target.style.backgroundColor = 'var(--vscode-list-activeSelectionBackground)';
                }
            }
        });

        document.addEventListener('dragleave', (e) => {
            const target = e.target?.closest('.group-content, .group-header');
            if (target) {
                target.style.backgroundColor = '';
            }
        });

        document.addEventListener('drop', (e) => {
            e.preventDefault();
            const contract = e.dataTransfer.getData('application/x-contract');
            const groupElement = e.target?.closest('[data-group-id]');
            if (groupElement && contract) {
                const targetGroup = groupElement.getAttribute('data-group-id');
                vscode.postMessage({ 
                    command: 'moveContractToGroup', 
                    contractPath: contract, 
                    targetGroupId: targetGroup 
                });
            }
        });
    </script>
</body>
</html>`;
    }

    private renderContracts(contracts: ContractInfo[]): string {
        if (contracts.length === 0) {
            return '<div class="empty-state">No contracts detected in workspace</div>';
        }

        return contracts.map(contract => this.createContractElement(contract)).join('');
    }

    private renderGroupsWithContracts(groups: GroupHierarchy[], contracts: ContractInfo[]): string {
        if (groups.length === 0) {
            return '<div class="empty-state">No contract groups created</div>';
        }

        const rootGroup = groups[0];
        if (!rootGroup) return '<div class="empty-state">No contracts detected</div>';

        return this.renderGroupHierarchy(rootGroup, contracts);
    }

    private renderGroupHierarchy(group: GroupHierarchy, contracts: ContractInfo[], indent: number = 0): string {
        const contractsInGroup = contracts.filter(c => group.contractIds.includes(c.path));
        const hasChildren = group.children && group.children.length > 0;
        const chevronClass = group.collapsed ? 'collapsed' : '';
        const chevron = hasChildren ? `<span class="group-chevron ${chevronClass}">▼</span>` : '<span style="width: 16px;"></span>';

        const groupContent = group.collapsed ? '' : `
            <div class="group-content" data-group-id="${this.escapeHtml(group.id)}">
                ${contractsInGroup.map(c => this.createContractElement(c)).join('')}
                ${(group.children || []).map(child => this.renderGroupHierarchy(child, contracts, indent + 1)).join('')}
            </div>
        `;

        const isRoot = !group.parentId;
        const actions = !isRoot ? `
            <div class="group-actions">
                <button class="group-btn" onclick="renameGroup('${this.escapeHtml(group.id)}')" title="Rename">✎</button>
                <button class="group-btn" onclick="deleteGroup('${this.escapeHtml(group.id)}')" title="Delete">✕</button>
            </div>
        ` : `<div class="group-actions"><button class="group-btn" onclick="createGroup('${this.escapeHtml(group.id)}')" title="Add Group">+</button></div>`;

        return `
            <div data-group-id="${this.escapeHtml(group.id)}">
                <div class="group-header" onclick="toggleGroup('${this.escapeHtml(group.id)}')">
                    ${chevron}
                    <span>${this.escapeHtml(group.name)}</span>
                    <span class="group-stats">(${group.contractIds.length + (group.children || []).reduce((sum, c) => sum + c.contractIds.length, 0)})</span>
                    ${actions}
                </div>
                ${groupContent}
            </div>
        `;
    }

    private createContractElement(contract: ContractInfo): string {
        const statusClass = contract.contractId ? 'status-deployed' : 'status-not-deployed';
        const statusText = contract.contractId ? 'Deployed' : 'Not Deployed';
        const buildStatus = contract.hasWasm ? 'Built' : 'Not Built';
        const buildStatusClass = contract.hasWasm ? 'status-deployed' : 'status-not-deployed';
        const functionsHtml = contract.functions && contract.functions.length > 0
            ? `<div class="functions-list">
                ${contract.functions.map(fn => `
                    <div class="function-item">
                        <span class="function-name">${this.escapeHtml(fn.name)}</span>
                        ${fn.parameters.length > 0 ? `(${fn.parameters.map(p => p.name).join(', ')})` : '()'}
                    </div>
                `).join('')}
               </div>`
            : '';

        return `
            <div class="contract-item" draggable="true" ondragstart="this.style.opacity='0.5'" ondragend="this.style.opacity='1'">
                <div class="contract-name">
                    ${this.escapeHtml(contract.name)}
                    <span class="status-badge ${statusClass}">${statusText}</span>
                    <span class="status-badge ${buildStatusClass}">${buildStatus}</span>
                </div>
                <div class="contract-path">${this.escapeHtml(contract.path)}</div>
                ${contract.contractId ? `<div class="contract-id">ID: ${this.escapeHtml(contract.contractId)}</div>` : ''}
                ${contract.lastDeployed ? `<div class="timestamp">Deployed: ${new Date(contract.lastDeployed).toLocaleString()}</div>` : ''}
                ${functionsHtml}
                <div class="contract-actions">
                    <button class="btn" onclick="build('${this.escapeHtml(contract.path)}')">Build</button>
                    ${contract.hasWasm ? `<button class="btn" onclick="deploy('${this.escapeHtml(contract.path)}')">Deploy</button>` : ''}
                    ${contract.contractId ? `<button class="btn btn-secondary" onclick="simulate('${this.escapeHtml(contract.contractId)}')">Simulate</button>` : ''}
                    ${contract.contractId ? `<button class="btn btn-secondary" onclick="inspectContract('${this.escapeHtml(contract.contractId)}')">Inspect</button>` : ''}
                </div>
            </div>
        `;
    }

    private renderDeployments(deployments: DeploymentInfo[]): string {
        if (deployments.length === 0) {
            return '<div class="empty-state">No deployments yet</div>';
        }

        return deployments.map(deployment => {
            const date = new Date(deployment.timestamp);
            return `
                <div class="deployment-item">
                    <div class="contract-id">Contract ID: ${this.escapeHtml(deployment.contractId)}</div>
                    ${deployment.transactionHash ? `<div class="contract-path">Tx: ${this.escapeHtml(deployment.transactionHash)}</div>` : ''}
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
