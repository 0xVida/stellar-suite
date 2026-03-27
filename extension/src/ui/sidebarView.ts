import * as vscode from 'vscode';
import { SidebarWebView } from './sidebarWebView';
import { WasmDetector } from '../utils/wasmDetector';
import { ContractInspector, ContractFunction } from '../services/contractInspector';
import { SorobanCliService } from '../services/sorobanCliService';

export interface ContractInfo {
    name: string;
    path: string;
    contractId?: string;
    hasWasm?: boolean;
    lastDeployed?: string;
    wasmSize?: number;
    wasmSizeFormatted?: string;
}

export interface DeploymentRecord {
    contractId: string;
    contractName: string;
    contractPath?: string;
    deployedAt: string;
    network: string;
    source: string;
}

export class SidebarViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'stellarSuite.contractsView';

    private _view?: vscode.WebviewView;
    private _webView?: SidebarWebView;
    private _context: vscode.ExtensionContext;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        context: vscode.ExtensionContext
    ) {
        this._context = context;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };

        this._webView = new SidebarWebView(webviewView.webview, this._extensionUri);
        this._webView.updateContent([], []);

        this.refresh();

        webviewView.webview.onDidReceiveMessage(
            async (message: any) => {
                try {
                    switch (message.command) {
                        case 'refresh':
                            await this.refresh();
                            break;
                        case 'deploy':
                            if (message.contractPath) {
                                this._context.workspaceState.update('selectedContractPath', message.contractPath);
                            }
                            await vscode.commands.executeCommand('stellarSuite.deployContract');
                            break;
                        case 'build':
                            if (message.contractPath) {
                                this._context.workspaceState.update('selectedContractPath', message.contractPath);
                                await vscode.commands.executeCommand('stellarSuite.buildContract');
                            }
                            break;
                        case 'simulate':
                            if (message.contractId) {
                                this._context.workspaceState.update('selectedContractId', message.contractId);
                            }
                            await vscode.commands.executeCommand('stellarSuite.simulateTransaction', {
                                contractId: message.contractId,
                                functionName: message.functionName
                            });
                            break;
                        case 'runInvoke':
                            if (message.contractId) {
                                this._context.workspaceState.update('selectedContractId', message.contractId);
                            }
                            await vscode.commands.executeCommand('stellarSuite.runInvoke', {
                                contractId: message.contractId,
                                functionName: message.functionName
                            });
                            break;
                        case 'copyToClipboard':
                            if (message.text) {
                                await vscode.env.clipboard.writeText(message.text);
                                vscode.window.showInformationMessage(`Copied to clipboard: ${message.text.substring(0, 12)}...`);
                            }
                            break;
                        case 'contractInfo':
                            if (message.contractId) {
                                this._context.workspaceState.update('selectedContractId', message.contractId);
                            }
                            await vscode.commands.executeCommand('stellarSuite.contractInfo', {
                                contractId: message.contractId
                            });
                            break;

                        case 'getCliHistory':
                            const history = this.getCliHistory();
                            webviewView.webview.postMessage({
                                type: 'cliHistory:data',
                                history: history
                            });
                            break;
                        case 'clearDeployments':
                            await this.clearDeployments();
                            break;
                        case 'installCli':
                            await vscode.commands.executeCommand('stellarSuite.installCli');
                            break;
                        case 'execute':
                            if (message.executeCommand) {
                                if (message.args) {
                                    await vscode.commands.executeCommand(message.executeCommand, message.args);
                                } else {
                                    await vscode.commands.executeCommand(message.executeCommand);
                                }
                            }
                            break;
                    }
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    vscode.window.showErrorMessage(`Stellar Kit: ${errorMsg}`);
                }
            },
            null,
            this._context.subscriptions
        );
    }

    public async refresh() {
        if (!this._view || !this._webView) {
            return;
        }

        const contracts = await this.getContracts();
        const deployments = this.getDeployments();
        const isCliInstalled = !!(await SorobanCliService.findCliPath());
        this._webView.updateContent(contracts, deployments, isCliInstalled);
    }

    private async getContracts(): Promise<ContractInfo[]> {
        const contracts: ContractInfo[] = [];

        const contractDirs = await WasmDetector.findContractDirectories();

        for (const dir of contractDirs) {
            const contractName = require('path').basename(dir);
            const wasmPath = WasmDetector.getExpectedWasmPath(dir);
            const fs = require('fs');
            const hasWasm = wasmPath && fs.existsSync(wasmPath);

            let contractId: string | undefined;
            let functions: ContractFunction[] | undefined;
            let wasmSize: number | undefined;
            let wasmSizeFormatted: string | undefined;

            // Get WASM file size if it exists
            if (hasWasm && wasmPath) {
                const stats = fs.statSync(wasmPath);
                wasmSize = stats.size;
                if (wasmSize) {
                    wasmSizeFormatted = this.formatFileSize(wasmSize);
                }
            }

            const deploymentHistory = this._context.workspaceState.get<DeploymentRecord[]>(
                'stellarSuite.deploymentHistory',
                []
            );
            const lastDeployment = deploymentHistory.find(d => {
                const deployedContracts = this._context.workspaceState.get<Record<string, string>>(
                    'stellarSuite.deployedContracts',
                    {}
                );
                // Use absolute path as key for lookup
                return deployedContracts[dir] === d.contractId || d.contractPath === dir;
            });

            if (lastDeployment) {
                contractId = lastDeployment.contractId;
            }

            contracts.push({
                name: contractName,
                path: dir,
                contractId,
                hasWasm,
                lastDeployed: lastDeployment?.deployedAt,
                wasmSize,
                wasmSizeFormatted
            });
        }

        return contracts;
    }

    private getDeployments(): DeploymentRecord[] {
        return this._context.workspaceState.get<DeploymentRecord[]>(
            'stellarSuite.deploymentHistory',
            []
        );
    }

    private getCliHistory(): any[] {
        const history = this._context.workspaceState.get<any[]>(
            'stellarSuite.cliHistory',
            []
        );
        return history.slice(-10);
    }



    private formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    public showDeploymentResult(deployment: DeploymentRecord) {
        const deploymentHistory = this._context.workspaceState.get<DeploymentRecord[]>(
            'stellarSuite.deploymentHistory',
            []
        );

        const exists = deploymentHistory.some(d =>
            d.contractId === deployment.contractId &&
            d.deployedAt === deployment.deployedAt
        );

        if (!exists) {
            deploymentHistory.push(deployment);
            this._context.workspaceState.update('stellarSuite.deploymentHistory', deploymentHistory);
        }

        const deployedContracts = this._context.workspaceState.get<Record<string, string>>(
            'stellarSuite.deployedContracts',
            {}
        );

        // Use path if available, fallback to name (for backwards compatibility/WASM only deploys)
        const key = deployment.contractPath || deployment.contractName;
        deployedContracts[key] = deployment.contractId;

        this._context.workspaceState.update('stellarSuite.deployedContracts', deployedContracts);

        this.refresh();
    }

    public showSimulationResult(contractId: string, result: any) {
        this.refresh();
    }

    public async clearDeployments() {
        const confirm = await vscode.window.showWarningMessage(
            'Are you sure you want to clear all deployment history? This cannot be undone.',
            { modal: true },
            'Clear All'
        );

        if (confirm !== 'Clear All') {
            return;
        }

        await this._context.workspaceState.update('stellarSuite.deploymentHistory', []);
        await this._context.workspaceState.update('stellarSuite.deployedContracts', {});
        await this._context.workspaceState.update('lastContractId', undefined);

        await this._context.workspaceState.update('selectedContractPath', undefined);
        await this._context.workspaceState.update('selectedContractId', undefined);

        await this.refresh();
        vscode.window.showInformationMessage('Deployment history cleared.');
    }

    public addCliHistoryEntry(command: string, args?: string[]) {
        const history = this._context.workspaceState.get<any[]>(
            'stellarSuite.cliHistory',
            []
        );

        const entry = {
            command: command,
            args: args || [],
            timestamp: new Date().toISOString()
        };

        history.push(entry);

        if (history.length > 50) {
            history.shift();
        }

        this._context.workspaceState.update('stellarSuite.cliHistory', history);

        if (this._view && this._webView) {
            const currentHistory = this.getCliHistory();
            this._view.webview.postMessage({
                type: 'cliHistory:data',
                history: currentHistory
            });
        }
    }
}