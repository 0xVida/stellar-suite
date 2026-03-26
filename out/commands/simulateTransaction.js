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
exports.simulateTransaction = simulateTransaction;
const vscode = __importStar(require("vscode"));
const sorobanCliService_1 = require("../services/sorobanCliService");
const rpcService_1 = require("../services/rpcService");
const contractInspector_1 = require("../services/contractInspector");
const workspaceDetector_1 = require("../utils/workspaceDetector");
const simulationPanel_1 = require("../ui/simulationPanel");
const errorFormatter_1 = require("../utils/errorFormatter");
async function simulateTransaction(context, sidebarProvider) {
    try {
        const config = vscode.workspace.getConfiguration('stellarSuite');
        const useLocalCli = config.get('useLocalCli', true);
        const cliPath = config.get('cliPath', 'stellar');
        const source = config.get('source', 'dev');
        const network = config.get('network', 'testnet') || 'testnet';
        const rpcUrl = config.get('rpcUrl', 'https://soroban-testnet.stellar.org:443');
        const lastContractId = context.workspaceState.get('lastContractId');
        let defaultContractId = lastContractId || '';
        try {
            if (!defaultContractId) {
                const detectedId = await workspaceDetector_1.WorkspaceDetector.findContractId();
                if (detectedId) {
                    defaultContractId = detectedId;
                }
            }
        }
        catch (error) {
        }
        const contractId = await vscode.window.showInputBox({
            prompt: 'Enter the contract ID (address)',
            placeHolder: defaultContractId || 'e.g., C...',
            value: defaultContractId,
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Contract ID is required';
                }
                if (!value.match(/^C[A-Z0-9]{55}$/)) {
                    return 'Invalid contract ID format (should start with C and be 56 characters)';
                }
                return null;
            }
        });
        if (!contractId) {
            return;
        }
        let contractFunctions = [];
        let selectedFunction = null;
        let functionName = '';
        if (useLocalCli) {
            const inspector = new contractInspector_1.ContractInspector(cliPath, source);
            try {
                contractFunctions = await inspector.getContractFunctions(contractId);
            }
            catch (error) {
            }
        }
        if (contractFunctions.length > 0) {
            const functionItems = contractFunctions.map(fn => ({
                label: fn.name,
                description: fn.description || '',
                detail: fn.parameters.length > 0
                    ? `Parameters: ${fn.parameters.map(p => p.name).join(', ')}`
                    : 'No parameters'
            }));
            const selected = await vscode.window.showQuickPick(functionItems, {
                placeHolder: 'Select a function to invoke'
            });
            if (!selected) {
                return;
            }
            selectedFunction = contractFunctions.find(f => f.name === selected.label) || null;
            functionName = selected.label;
        }
        else {
            const input = await vscode.window.showInputBox({
                prompt: 'Enter the function name to call',
                placeHolder: 'e.g., hello',
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'Function name is required';
                    }
                    return null;
                }
            });
            if (!input) {
                return;
            }
            functionName = input;
            if (useLocalCli) {
                const inspector = new contractInspector_1.ContractInspector(cliPath, source);
                selectedFunction = await inspector.getFunctionHelp(contractId, functionName);
            }
        }
        let args = [];
        if (selectedFunction && selectedFunction.parameters.length > 0) {
            const argsObj = {};
            for (const param of selectedFunction.parameters) {
                const paramValue = await vscode.window.showInputBox({
                    prompt: `Enter value for parameter: ${param.name}${param.type ? ` (${param.type})` : ''}${param.required ? '' : ' (optional)'}`,
                    placeHolder: param.description || `Value for ${param.name}`,
                    ignoreFocusOut: !param.required,
                    validateInput: (value) => {
                        if (param.required && (!value || value.trim().length === 0)) {
                            return `${param.name} is required`;
                        }
                        return null;
                    }
                });
                if (param.required && paramValue === undefined) {
                    return;
                }
                if (paramValue !== undefined && paramValue.trim().length > 0) {
                    try {
                        argsObj[param.name] = JSON.parse(paramValue);
                    }
                    catch {
                        argsObj[param.name] = paramValue;
                    }
                }
            }
            args = [argsObj];
        }
        else {
            const argsInput = await vscode.window.showInputBox({
                prompt: 'Enter function arguments as JSON object (e.g., {"name": "value"})',
                placeHolder: 'e.g., {"name": "world"}',
                value: '{}'
            });
            if (argsInput === undefined) {
                return;
            }
            try {
                const parsed = JSON.parse(argsInput || '{}');
                if (typeof parsed === 'object' && !Array.isArray(parsed) && parsed !== null) {
                    args = [parsed];
                }
                else {
                    vscode.window.showErrorMessage('Arguments must be a JSON object');
                    return;
                }
            }
            catch (error) {
                vscode.window.showErrorMessage(`Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
                return;
            }
        }
        const panel = simulationPanel_1.SimulationPanel.createOrShow(context);
        panel.updateResults({ success: false, error: 'Running simulation...' }, contractId, functionName, args);
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Simulating Soroban Transaction',
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: 'Initializing...' });
            let result;
            if (useLocalCli) {
                progress.report({ increment: 30, message: 'Using Stellar CLI...' });
                let actualCliPath = cliPath;
                let cliService = new sorobanCliService_1.SorobanCliService(actualCliPath, source);
                let cliAvailable = await cliService.isAvailable();
                if (!cliAvailable && cliPath === 'stellar') {
                    progress.report({ increment: 35, message: 'Auto-detecting Stellar CLI...' });
                    const foundPath = await sorobanCliService_1.SorobanCliService.findCliPath();
                    if (foundPath) {
                        actualCliPath = foundPath;
                        cliService = new sorobanCliService_1.SorobanCliService(actualCliPath, source);
                        cliAvailable = await cliService.isAvailable();
                    }
                }
                if (!cliAvailable) {
                    const foundPath = await sorobanCliService_1.SorobanCliService.findCliPath();
                    const suggestion = foundPath
                        ? `\n\nFound Stellar CLI at: ${foundPath}\nUpdate your stellarSuite.cliPath setting to: "${foundPath}"`
                        : '\n\nCommon locations:\n- ~/.cargo/bin/stellar\n- /usr/local/bin/stellar\n\nOr install Stellar CLI: https://developers.stellar.org/docs/tools/cli';
                    result = {
                        success: false,
                        error: `Stellar CLI not found at "${cliPath}".${suggestion}`
                    };
                }
                else {
                    progress.report({ increment: 50, message: 'Executing simulation...' });
                    result = await cliService.simulateTransaction(contractId, functionName, args, network);
                    if (sidebarProvider) {
                        const argsStr = args.length > 0 ? JSON.stringify(args) : '';
                        sidebarProvider.addCliHistoryEntry('stellar contract invoke', ['--id', contractId, '--source', source, '--network', network, '--', functionName, argsStr].filter(Boolean));
                    }
                }
            }
            else {
                progress.report({ increment: 30, message: 'Connecting to RPC...' });
                const rpcService = new rpcService_1.RpcService(rpcUrl);
                progress.report({ increment: 50, message: 'Executing simulation...' });
                result = await rpcService.simulateTransaction(contractId, functionName, args);
                if (sidebarProvider) {
                    const argsStr = args.length > 0 ? JSON.stringify(args[0]) : '';
                    sidebarProvider.addCliHistoryEntry('RPC simulateTransaction', [contractId, functionName, argsStr].filter(Boolean));
                }
            }
            progress.report({ increment: 100, message: 'Complete' });
            panel.updateResults(result, contractId, functionName, args);
            if (sidebarProvider) {
                sidebarProvider.showSimulationResult(contractId, result);
            }
            if (result.success) {
                vscode.window.showInformationMessage('Simulation completed successfully');
            }
            else {
                vscode.window.showErrorMessage(`Simulation failed: ${result.error}`);
            }
        });
    }
    catch (error) {
        const formatted = (0, errorFormatter_1.formatError)(error, 'Simulation');
        vscode.window.showErrorMessage(`${formatted.title}: ${formatted.message}`);
    }
}
//# sourceMappingURL=simulateTransaction.js.map