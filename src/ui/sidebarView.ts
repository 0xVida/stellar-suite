import * as vscode from 'vscode';
import { SidebarWebView } from './sidebarWebView';
import { WasmDetector } from '../utils/wasmDetector';
import { ContractInspector, ContractFunction } from '../services/contractInspector';

export interface ContractInfo {
    name: string;
    path: string;
    contractId?: string;
    functions?: ContractFunction[];
    hasWasm: boolean;
    lastDeployed?: string;
}

export interface DeploymentRecord {
    contractId: string;
    contractName: string;
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
        context: vscode.ExtensionContext,
        private readonly groupService?: any // Use any for now or import ContractGroupService
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
                            await vscode.commands.executeCommand('stellarSuite.simulateTransaction');
                            break;
                        case 'inspectContract':
                            await this.inspectContract(message.contractId);
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
        this._webView.updateContent(contracts, deployments);
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
            const deploymentHistory = this._context.workspaceState.get<DeploymentRecord[]>(
                'stellarSuite.deploymentHistory',
                []
            );
            const lastDeployment = deploymentHistory.find(d => {
                const deployedContracts = this._context.workspaceState.get<Record<string, string>>(
                    'stellarSuite.deployedContracts',
                    {}
                );
                return deployedContracts[dir] === d.contractId;
            });
            
            if (lastDeployment) {
                contractId = lastDeployment.contractId;
            }

            if (contractId) {
                const config = vscode.workspace.getConfiguration('stellarSuite');
                const cliPath = config.get<string>('cliPath', 'stellar');
                const source = config.get<string>('source', 'dev');
                const network = config.get<string>('network', 'testnet') || 'testnet';
                const inspector = new ContractInspector(cliPath, source, network);
                try {
                    functions = await inspector.getContractFunctions(contractId);
                } catch (error) {
                    // Silently fail if inspection fails
                }
            }

            contracts.push({
                name: contractName,
                path: dir,
                contractId,
                functions,
                hasWasm,
                lastDeployed: lastDeployment?.deployedAt
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

    private async inspectContract(contractId: string): Promise<void> {
        if (!this._view || !this._webView) {
            return;
        }

        const config = vscode.workspace.getConfiguration('stellarSuite');
        const cliPath = config.get<string>('cliPath', 'stellar');
        const source = config.get<string>('source', 'dev');
        const network = config.get<string>('network', 'testnet') || 'testnet';

        try {
            const inspector = new ContractInspector(cliPath, source, network);
            const functions = await inspector.getContractFunctions(contractId);

            const contracts = await this.getContracts();
            const contract = contracts.find(c => c.contractId === contractId);
            if (contract) {
                contract.functions = functions;
            }

            const deployments = this.getDeployments();
            this._webView.updateContent(contracts, deployments);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to inspect contract: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
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
        deployedContracts[deployment.contractName] = deployment.contractId;
        this._context.workspaceState.update('stellarSuite.deployedContracts', deployedContracts);
        
        this.refresh();
    }

    public showSimulationResult(contractId: string, result: any) {
        this.refresh();
    }

    public async clearDeployments() {
        await this._context.workspaceState.update('stellarSuite.deploymentHistory', []);
        await this._context.workspaceState.update('stellarSuite.deployedContracts', {});
        await this._context.workspaceState.update('lastContractId', undefined);
        await this.refresh();
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