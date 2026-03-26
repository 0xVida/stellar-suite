"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SidebarViewProvider = void 0;
const vscode = __importStar(require("vscode"));
const sidebarWebView_1 = require("./sidebarWebView");
const wasmDetector_1 = require("../utils/wasmDetector");
const contractInspector_1 = require("../services/contractInspector");
class SidebarViewProvider {
    constructor(_extensionUri, context) {
        this._extensionUri = _extensionUri;
        this._context = context;
    }
    resolveWebviewView(webviewView, context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };
        this._webView = new sidebarWebView_1.SidebarWebView(webviewView.webview, this._extensionUri);
        this._webView.updateContent([], []);
        this.refresh();
        webviewView.webview.onDidReceiveMessage(async (message) => {
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
            }
            catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Stellar Suite: ${errorMsg}`);
            }
        }, null, this._context.subscriptions);
    }
    async refresh() {
        if (!this._view || !this._webView) {
            return;
        }
        const contracts = await this.getContracts();
        const deployments = this.getDeployments();
        this._webView.updateContent(contracts, deployments);
    }
    async getContracts() {
        const contracts = [];
        const contractDirs = await wasmDetector_1.WasmDetector.findContractDirectories();
        for (const dir of contractDirs) {
            const contractName = require('path').basename(dir);
            const wasmPath = wasmDetector_1.WasmDetector.getExpectedWasmPath(dir);
            const fs = require('fs');
            const hasWasm = wasmPath && fs.existsSync(wasmPath);
            let contractId;
            let functions;
            const deploymentHistory = this._context.workspaceState.get('stellarSuite.deploymentHistory', []);
            const lastDeployment = deploymentHistory.find(d => {
                const deployedContracts = this._context.workspaceState.get('stellarSuite.deployedContracts', {});
                return deployedContracts[dir] === d.contractId;
            });
            if (lastDeployment) {
                contractId = lastDeployment.contractId;
            }
            if (contractId) {
                const config = vscode.workspace.getConfiguration('stellarSuite');
                const cliPath = config.get('cliPath', 'stellar');
                const source = config.get('source', 'dev');
                const network = config.get('network', 'testnet') || 'testnet';
                const inspector = new contractInspector_1.ContractInspector(cliPath, source, network);
                try {
                    functions = await inspector.getContractFunctions(contractId);
                }
                catch (error) {
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
    getDeployments() {
        return this._context.workspaceState.get('stellarSuite.deploymentHistory', []);
    }
    getCliHistory() {
        const history = this._context.workspaceState.get('stellarSuite.cliHistory', []);
        return history.slice(-10);
    }
    async inspectContract(contractId) {
        if (!this._view || !this._webView) {
            return;
        }
        const config = vscode.workspace.getConfiguration('stellarSuite');
        const cliPath = config.get('cliPath', 'stellar');
        const source = config.get('source', 'dev');
        const network = config.get('network', 'testnet') || 'testnet';
        try {
            const inspector = new contractInspector_1.ContractInspector(cliPath, source, network);
            const functions = await inspector.getContractFunctions(contractId);
            const contracts = await this.getContracts();
            const contract = contracts.find(c => c.contractId === contractId);
            if (contract) {
                contract.functions = functions;
            }
            const deployments = this.getDeployments();
            this._webView.updateContent(contracts, deployments);
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to inspect contract: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    showDeploymentResult(deployment) {
        const deploymentHistory = this._context.workspaceState.get('stellarSuite.deploymentHistory', []);
        const exists = deploymentHistory.some(d => d.contractId === deployment.contractId &&
            d.deployedAt === deployment.deployedAt);
        if (!exists) {
            deploymentHistory.push(deployment);
            this._context.workspaceState.update('stellarSuite.deploymentHistory', deploymentHistory);
        }
        const deployedContracts = this._context.workspaceState.get('stellarSuite.deployedContracts', {});
        deployedContracts[deployment.contractName] = deployment.contractId;
        this._context.workspaceState.update('stellarSuite.deployedContracts', deployedContracts);
        this.refresh();
    }
    showSimulationResult(contractId, result) {
        this.refresh();
    }
    async clearDeployments() {
        await this._context.workspaceState.update('stellarSuite.deploymentHistory', []);
        await this._context.workspaceState.update('stellarSuite.deployedContracts', {});
        await this._context.workspaceState.update('lastContractId', undefined);
        await this.refresh();
    }
    addCliHistoryEntry(command, args) {
        const history = this._context.workspaceState.get('stellarSuite.cliHistory', []);
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
exports.SidebarViewProvider = SidebarViewProvider;
SidebarViewProvider.viewType = 'stellarSuite.contractsView';
//# sourceMappingURL=sidebarView.js.map