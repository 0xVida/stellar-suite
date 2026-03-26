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
exports.buildContract = buildContract;
const vscode = __importStar(require("vscode"));
const contractDeployer_1 = require("../services/contractDeployer");
const wasmDetector_1 = require("../utils/wasmDetector");
const errorFormatter_1 = require("../utils/errorFormatter");
const outputChannel_1 = require("../utils/outputChannel");
async function buildContract(context, sidebarProvider) {
    try {
        const config = vscode.workspace.getConfiguration('stellarSuite');
        const cliPath = config.get('cliPath', 'stellar');
        const outputChannel = (0, outputChannel_1.getSharedOutputChannel)();
        (0, outputChannel_1.showSharedOutputChannel)();
        outputChannel.appendLine('=== Stellar Contract Build ===\n');
        const selectedContractPath = context.workspaceState.get('selectedContractPath');
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Building Contract',
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: 'Detecting contract...' });
            let contractDir = null;
            if (selectedContractPath) {
                const fs = require('fs');
                if (fs.existsSync(selectedContractPath)) {
                    const stats = fs.statSync(selectedContractPath);
                    if (stats.isDirectory()) {
                        contractDir = selectedContractPath;
                        outputChannel.appendLine(`Using selected contract directory: ${contractDir}`);
                        context.workspaceState.update('selectedContractPath', undefined);
                    }
                }
            }
            if (!contractDir) {
                progress.report({ increment: 10, message: 'Searching workspace...' });
                const contractDirs = await wasmDetector_1.WasmDetector.findContractDirectories();
                outputChannel.appendLine(`Found ${contractDirs.length} contract directory(ies) in workspace`);
                if (contractDirs.length === 0) {
                    vscode.window.showErrorMessage('No contract directories found in workspace');
                    return;
                }
                else if (contractDirs.length === 1) {
                    contractDir = contractDirs[0];
                }
                else {
                    const selected = await vscode.window.showQuickPick(contractDirs.map(dir => ({
                        label: require('path').basename(dir),
                        description: dir,
                        value: dir
                    })), {
                        placeHolder: 'Select contract to build'
                    });
                    if (!selected) {
                        return;
                    }
                    contractDir = selected.value;
                }
            }
            if (!contractDir) {
                vscode.window.showErrorMessage('No contract directory selected');
                return;
            }
            progress.report({ increment: 30, message: 'Building contract...' });
            outputChannel.appendLine(`\nBuilding contract in: ${contractDir}`);
            outputChannel.appendLine('Running: stellar contract build\n');
            const deployer = new contractDeployer_1.ContractDeployer(cliPath, 'dev', 'testnet');
            const buildResult = await deployer.buildContract(contractDir);
            if (sidebarProvider) {
                sidebarProvider.addCliHistoryEntry('stellar contract build', [contractDir]);
            }
            progress.report({ increment: 90, message: 'Finalizing...' });
            outputChannel.appendLine('=== Build Result ===');
            if (buildResult.success) {
                outputChannel.appendLine('Build successful!');
                if (buildResult.wasmPath) {
                    outputChannel.appendLine(`WASM file: ${buildResult.wasmPath}`);
                }
                if (buildResult.output) {
                    outputChannel.appendLine('\n=== Full Build Output ===');
                    outputChannel.appendLine(buildResult.output);
                }
                vscode.window.showInformationMessage('Contract built successfully!');
                if (sidebarProvider) {
                    await sidebarProvider.refresh();
                }
            }
            else {
                outputChannel.appendLine('Build failed!');
                outputChannel.appendLine(`Error: ${buildResult.output}`);
                if (buildResult.output) {
                    outputChannel.appendLine('\n=== Full Build Output ===');
                    outputChannel.appendLine(buildResult.output);
                }
                vscode.window.showErrorMessage(`Build failed: ${buildResult.output}`);
            }
            progress.report({ increment: 100, message: 'Complete' });
        });
    }
    catch (error) {
        const formatted = (0, errorFormatter_1.formatError)(error, 'Build');
        vscode.window.showErrorMessage(`${formatted.title}: ${formatted.message}`);
    }
}
//# sourceMappingURL=buildContract.js.map