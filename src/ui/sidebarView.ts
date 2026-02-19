import * as vscode from 'vscode';
import { SidebarWebView } from './sidebarWebView';
import { WasmDetector } from '../utils/wasmDetector';
import { ContractInspector, ContractFunction } from '../services/contractInspector';
import { ContractGroupService } from '../services/contractGroupService';

export interface ContractInfo {
    name: string;
    path: string;
    contractId?: string;
    functions?: ContractFunction[];
    hasWasm: boolean;
    lastDeployed?: string;
}

export interface DeploymentInfo {
    contractId: string;
    transactionHash?: string;
    timestamp: string;
    network: string;
    source: string;
}

export class SidebarViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'stellarSuite.contractsView';

    private _view?: vscode.WebviewView;
    private _webView?: SidebarWebView;
    private _context: vscode.ExtensionContext;
    private _groupService: ContractGroupService;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        context: vscode.ExtensionContext,
        groupService: ContractGroupService
    ) {
        this._context = context;
        this._groupService = groupService;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;
        const outputChannel = vscode.window.createOutputChannel('Stellar Suite');
        outputChannel.appendLine('[Sidebar] Resolving webview view...');

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };

        this._webView = new SidebarWebView(webviewView.webview, this._extensionUri);
        
        this._webView.updateContent([], []);
        outputChannel.appendLine('[Sidebar] Initial content set');
        
        vscode.commands.getCommands().then(commands => {
            const stellarCommands = commands.filter(c => c.startsWith('stellarSuite.'));
            outputChannel.appendLine(`[Sidebar] Available commands when view resolved: ${stellarCommands.join(', ')}`);
            if (!commands.includes('stellarSuite.buildContract')) {
                outputChannel.appendLine('[Sidebar] WARNING: buildContract command not found!');
            }
            if (!commands.includes('stellarSuite.deployContract')) {
                outputChannel.appendLine('[Sidebar] WARNING: deployContract command not found!');
            }
        });
        
        this.refresh();

        webviewView.webview.onDidReceiveMessage(
            async message => {
                console.log('[Stellar Suite] Received message:', message);
                const outputChannel = vscode.window.createOutputChannel('Stellar Suite');
                outputChannel.appendLine(`[Sidebar] Received command: ${message.command}`);
                
                try {
                    switch (message.command) {
                        case 'refresh':
                            outputChannel.appendLine('[Sidebar] Refreshing contracts...');
                            await this.refresh();
                            outputChannel.appendLine('[Sidebar] Refresh complete');
                            break;
                        case 'deploy':
                            outputChannel.appendLine(`[Sidebar] Deploy requested for: ${message.contractPath || 'default'}`);
                            if (message.contractPath) {
                                this._context.workspaceState.update('selectedContractPath', message.contractPath);
                            }
                            const deployCmd = await vscode.commands.getCommands();
                            outputChannel.appendLine(`[Sidebar] Available commands: ${deployCmd.filter(c => c.includes('stellar')).join(', ')}`);
                            if (deployCmd.includes('stellarSuite.deployContract')) {
                                await vscode.commands.executeCommand('stellarSuite.deployContract');
                            } else {
                                outputChannel.appendLine('[Sidebar] ERROR: deployContract command not found!');
                                vscode.window.showErrorMessage('Deploy command not found. Extension may not be fully activated.');
                            }
                            break;
                        case 'build':
                            outputChannel.appendLine(`[Sidebar] Build requested for: ${message.contractPath}`);
                            if (message.contractPath) {
                                this._context.workspaceState.update('selectedContractPath', message.contractPath);
                                const buildCmd = await vscode.commands.getCommands();
                                outputChannel.appendLine(`[Sidebar] Available commands: ${buildCmd.filter(c => c.includes('stellar')).join(', ')}`);
                                if (buildCmd.includes('stellarSuite.buildContract')) {
                                    await vscode.commands.executeCommand('stellarSuite.buildContract');
                                } else {
                                    outputChannel.appendLine('[Sidebar] ERROR: buildContract command not found!');
                                    vscode.window.showErrorMessage('Build command not found. Extension may not be fully activated.');
                                }
                            }
                            break;
                        case 'simulate':
                            outputChannel.appendLine(`[Sidebar] Simulate requested for: ${message.contractId}`);
                            if (message.contractId) {
                                this._context.workspaceState.update('selectedContractId', message.contractId);
                            }
                            await vscode.commands.executeCommand('stellarSuite.simulateTransaction');
                            break;
                        case 'inspectContract':
                            outputChannel.appendLine(`[Sidebar] Inspect requested for: ${message.contractId}`);
                            await this.inspectContract(message.contractId);
                            break;
                        case 'toggleGroupCollapse':
                            outputChannel.appendLine(`[Sidebar] Toggle group collapse: ${message.groupId}`);
                            await vscode.commands.executeCommand('stellarSuite.toggleGroupCollapse', message.groupId);
                            break;
                        case 'renameGroup':
                            outputChannel.appendLine(`[Sidebar] Rename group: ${message.groupId}`);
                            await vscode.commands.executeCommand('stellarSuite.renameGroup', message.groupId);
                            break;
                        case 'deleteGroup':
                            outputChannel.appendLine(`[Sidebar] Delete group: ${message.groupId}`);
                            await vscode.commands.executeCommand('stellarSuite.deleteGroup', message.groupId);
                            break;
                        case 'createGroup':
                            outputChannel.appendLine(`[Sidebar] Create group under: ${message.parentGroupId || 'root'}`);
                            await vscode.commands.executeCommand('stellarSuite.createGroup', message.parentGroupId);
                            break;
                        case 'moveContractToGroup':
                            outputChannel.appendLine(`[Sidebar] Move contract to group: ${message.contractPath} -> ${message.targetGroupId}`);
                            // TODO: Implement contract to group assignment
                            break;
                    }
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    outputChannel.appendLine(`[Sidebar] Error: ${errorMsg}`);
                    if (error instanceof Error && error.stack) {
                        outputChannel.appendLine(`[Sidebar] Stack: ${error.stack}`);
                    }
                    vscode.window.showErrorMessage(`Stellar Suite: ${errorMsg}`);
                    console.error('[Stellar Suite] Error handling message:', error);
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
        const groupHierarchy = [this._groupService.getGroupHierarchy()];
        this._webView.updateContent(contracts, deployments, groupHierarchy);
    }

    private async getContracts(): Promise<ContractInfo[]> {
        const contracts: ContractInfo[] = [];
        const outputChannel = vscode.window.createOutputChannel('Stellar Suite');
        outputChannel.appendLine('[Sidebar] Scanning for contracts...');

        const contractDirs = await WasmDetector.findContractDirectories();
        outputChannel.appendLine(`[Sidebar] Found ${contractDirs.length} contract directory(ies)`);
        
        for (const dir of contractDirs) {
            const contractName = require('path').basename(dir);
            const wasmPath = WasmDetector.getExpectedWasmPath(dir);
            const fs = require('fs');
            const hasWasm = wasmPath && fs.existsSync(wasmPath);
            
            outputChannel.appendLine(`[Sidebar] Contract: ${contractName}, Path: ${dir}, Has WASM: ${hasWasm}`);
            
            let contractId: string | undefined;
            let functions: ContractFunction[] | undefined;
            const lastDeployment = this._context.workspaceState.get<DeploymentInfo>('lastDeployment');
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
                    outputChannel.appendLine(`[Sidebar] Could not inspect functions for ${contractName}: ${error}`);
                }
            }

            contracts.push({
                name: contractName,
                path: dir,
                contractId,
                functions,
                hasWasm,
                lastDeployed: lastDeployment?.timestamp
            });
        }

        return contracts;
    }

    /**
     * Get deployment history from workspace state.
     */
    private getDeployments(): DeploymentInfo[] {
        const lastDeployment = this._context.workspaceState.get<DeploymentInfo>('lastDeployment');
        if (lastDeployment) {
            return [lastDeployment];
        }
        return [];
    }

    /**
     * Inspect a contract to get its functions.
     */
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

    public showDeploymentResult(deployment: DeploymentInfo) {
        this._context.workspaceState.update('lastDeployment', deployment);
        this._context.workspaceState.update('lastContractId', deployment.contractId);
        this.refresh();
    }

    public showSimulationResult(contractId: string, result: any) {
        this.refresh();
    }
}
