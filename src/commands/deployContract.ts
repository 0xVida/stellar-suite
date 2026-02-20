import * as vscode from 'vscode';
import { ContractDeployer } from '../services/contractDeployer';
import { WasmDetector } from '../utils/wasmDetector';
import { formatError } from '../utils/errorFormatter';
import { SidebarViewProvider } from '../ui/sidebarView';
import * as path from 'path';
import { resolveCliConfigurationForCommand } from '../services/cliConfigurationVscode';
import { DeploymentSigningWorkflowService } from '../services/deploymentSigningWorkflowService';
import {
    DeploymentSigningMethod,
    DeploymentSigningResult,
} from '../services/transactionSigningService';
import { ProgressIndicatorService } from '../services/progressIndicatorService';
import { formatProgressMessage, OperationProgressStatusBar } from '../ui/progressComponents';

function reportNotificationProgress(
    progress: vscode.Progress<{ message?: string; increment?: number }>,
    percentage: number | undefined,
    message: string,
    lastPercentage: { value: number }
): void {
    if (typeof percentage === 'number') {
        const next = Math.max(lastPercentage.value, Math.round(percentage));
        const increment = next - lastPercentage.value;
        if (increment > 0) {
            progress.report({ increment, message });
            lastPercentage.value = next;
            return;
        }
    }

    progress.report({ message });
}

export async function deployContract(context: vscode.ExtensionContext, sidebarProvider?: SidebarViewProvider) {
    const progressService = new ProgressIndicatorService();
    const operation = progressService.createOperation({
        id: `deploy-${Date.now()}`,
        title: 'Deploy Contract',
        cancellable: true,
    });
    const statusBar = new OperationProgressStatusBar();
    statusBar.bind(operation);

    try {
        const resolvedCliConfig = await resolveCliConfigurationForCommand(context);
        if (!resolvedCliConfig.validation.valid) {
            vscode.window.showErrorMessage(
                `CLI configuration is invalid: ${resolvedCliConfig.validation.errors.join(' ')}`
            );
            return;
        }

        const cliPath = resolvedCliConfig.configuration.cliPath;
        const source = resolvedCliConfig.configuration.source;
        const network = resolvedCliConfig.configuration.network;

        const outputChannel = vscode.window.createOutputChannel('Stellar Suite - Deployment');
        outputChannel.show(true);
        outputChannel.appendLine('=== Stellar Contract Deployment ===\n');
        console.log('[Deploy] Starting deployment...');

        const selectedContractPath = context.workspaceState.get<string>('selectedContractPath');
        if (selectedContractPath) {
            outputChannel.appendLine(`[Deploy] Using selected contract path: ${selectedContractPath}`);
            context.workspaceState.update('selectedContractPath', undefined);
        }

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Deploying Contract',
                cancellable: true
            },
            async (
                progress: vscode.Progress<{ message?: string; increment?: number }>,
                token: vscode.CancellationToken
            ) => {
                operation.start('Preparing deployment...');
                operation.bindCancellationToken(token);

                const lastPercentage = { value: 0 };
                const progressSubscription = operation.onUpdate((snapshot) => {
                    reportNotificationProgress(
                        progress,
                        snapshot.percentage,
                        formatProgressMessage(snapshot),
                        lastPercentage
                    );
                });

                try {
                    operation.setIndeterminate('Detecting contract...');

                let contractDir: string | null = null;
                let wasmPath: string | null = null;
                let deployFromWasm = false;

                operation.report({ percentage: 10, message: 'Searching workspace...' });
                if (selectedContractPath) {
                    const fs = require('fs');
                    if (fs.existsSync(selectedContractPath)) {
                        const stats = fs.statSync(selectedContractPath);
                        if (stats.isFile() && selectedContractPath.endsWith('.wasm')) {
                            // It's a WASM file
                            wasmPath = selectedContractPath;
                            deployFromWasm = true;
                            outputChannel.appendLine(`Using selected WASM file: ${wasmPath}`);
                        } else if (stats.isDirectory()) {
                            const cargoToml = path.join(selectedContractPath, 'Cargo.toml');
                            if (fs.existsSync(cargoToml)) {
                                contractDir = selectedContractPath;
                                outputChannel.appendLine(`Using selected contract directory: ${contractDir}`);
                            } else {
                                const parentDir = path.dirname(selectedContractPath);
                                const parentCargoToml = path.join(parentDir, 'Cargo.toml');
                                if (fs.existsSync(parentCargoToml)) {
                                    contractDir = parentDir;
                                    outputChannel.appendLine(`Using parent contract directory: ${contractDir}`);
                                } else {
                                    const wasmFiles = fs.readdirSync(selectedContractPath).filter((f: string) => f.endsWith('.wasm'));
                                    if (wasmFiles.length > 0) {
                                        wasmPath = path.join(selectedContractPath, wasmFiles[0]);
                                        deployFromWasm = true;
                                        outputChannel.appendLine(`Found WASM file in directory: ${wasmPath}`);
                                    } else {
                                        contractDir = selectedContractPath;
                                        outputChannel.appendLine(`Using selected directory as contract: ${contractDir}`);
                                    }
                                }
                            }
                        }
                    }
                }

                if (!contractDir && !wasmPath) {
                    const contractDirs = await WasmDetector.findContractDirectories();
                    outputChannel.appendLine(`Found ${contractDirs.length} contract directory(ies) in workspace`);

                    const wasmFiles = await WasmDetector.findWasmFiles();
                    outputChannel.appendLine(`Found ${wasmFiles.length} WASM file(s) in workspace`);

                    if (contractDirs.length > 0) {
                        if (contractDirs.length === 1) {
                            contractDir = contractDirs[0];
                            outputChannel.appendLine(`Using contract directory: ${contractDir}`);
                        } else {
                            const fs = require('fs');
                            const selected = await vscode.window.showQuickPick(
                                contractDirs.map(dir => {
                                    const wasm = WasmDetector.getExpectedWasmPath(dir);
                                    const hasWasm = wasm && fs.existsSync(wasm);
                                    return {
                                        label: path.basename(dir),
                                        description: dir,
                                        detail: hasWasm ? '✓ WASM found' : '⚠ Needs build',
                                        value: dir
                                    };
                                }),
                                {
                                    placeHolder: 'Multiple contracts found. Select one to deploy:'
                                }
                            );
                            if (!selected) {
                                return;
                            }
                            contractDir = selected.value;
                            outputChannel.appendLine(`Selected contract directory: ${contractDir}`);
                        }

                        if (contractDir) {
                            const expectedWasm = WasmDetector.getExpectedWasmPath(contractDir);
                            const fs = require('fs');
                            if (expectedWasm && fs.existsSync(expectedWasm)) {
                                const useExisting = await vscode.window.showQuickPick(
                                    [
                                        { label: 'Deploy existing WASM', value: 'wasm', detail: expectedWasm },
                                        { label: 'Build and deploy', value: 'build' }
                                    ],
                                    {
                                        placeHolder: 'WASM file found. Deploy existing or build first?'
                                    }
                                );

                                if (!useExisting) {
                                    return;
                                }

                                if (useExisting.value === 'wasm') {
                                    wasmPath = expectedWasm;
                                    deployFromWasm = true;
                                }
                            }
                        }
                    } else if (wasmFiles.length > 0) {
                        if (wasmFiles.length === 1) {
                            wasmPath = wasmFiles[0];
                            deployFromWasm = true;
                            outputChannel.appendLine(`Using WASM file: ${wasmPath}`);
                        } else {
                            // Multiple WASM files - show picker sorted by modification time
                            const fs = require('fs');
                            const wasmWithStats = wasmFiles.map(file => ({
                                path: file,
                                mtime: fs.statSync(file).mtime.getTime()
                            })).sort((a, b) => b.mtime - a.mtime);

                            const selected = await vscode.window.showQuickPick(
                                wasmWithStats.map(({ path: filePath }) => ({
                                    label: path.basename(filePath),
                                    description: path.dirname(filePath),
                                    value: filePath
                                })),
                                {
                                    placeHolder: 'Multiple WASM files found. Select one to deploy:'
                                }
                            );
                            if (!selected) {
                                return;
                            }
                            wasmPath = selected.value;
                            deployFromWasm = true;
                            outputChannel.appendLine(`Selected WASM file: ${wasmPath}`);
                        }
                    } else {
                        // Fallback: try active editor (if any)
                        contractDir = WasmDetector.getActiveContractDirectory();
                        if (contractDir) {
                            outputChannel.appendLine(`Found contract from active file: ${contractDir}`);
                        }
                    }
                }

                // If still no contract found, ask user
                if (!contractDir && !wasmPath) {
                    const action = await vscode.window.showQuickPick(
                        [
                            { label: 'Select WASM file...', value: 'wasm' },
                            { label: 'Select contract directory...', value: 'dir' }
                        ],
                        {
                            placeHolder: 'No contract detected in workspace. How would you like to proceed?'
                        }
                    );

                    if (!action) {
                        return;
                    }

                    if (action.value === 'wasm') {
                        const fileUri = await vscode.window.showOpenDialog({
                            canSelectFiles: true,
                            canSelectFolders: false,
                            canSelectMany: false,
                            filters: {
                                'WASM files': ['wasm']
                            },
                            title: 'Select WASM file to deploy'
                        });

                        if (!fileUri || fileUri.length === 0) {
                            return;
                        }

                        wasmPath = fileUri[0].fsPath;
                        deployFromWasm = true;
                    } else {
                        const folderUri = await vscode.window.showOpenDialog({
                            canSelectFiles: false,
                            canSelectFolders: true,
                            canSelectMany: false,
                            title: 'Select contract directory'
                        });

                        if (!folderUri || folderUri.length === 0) {
                            return;
                        }

                        contractDir = folderUri[0].fsPath;
                    }
                }

                if (!contractDir && !wasmPath) {
                    vscode.window.showErrorMessage('No contract or WASM file selected');
                    return;
                }

                // Create deployer
                const deployer = new ContractDeployer(cliPath, source, network);
                const signingWorkflow = new DeploymentSigningWorkflowService(context, outputChannel);
                const signingConfig = vscode.workspace.getConfiguration('stellarSuite.signing');

                let result;
                let signingResult: DeploymentSigningResult | undefined;
                let deployableWasmPath: string | undefined = wasmPath || undefined;
                let resolvedContractDir = contractDir || undefined;
                let contractRootDir: string | undefined;
                let contractNameForRecord: string | undefined;

                if (deployFromWasm && wasmPath) {
                    // Deploy directly from provided WASM (no build)
                    contractRootDir = path.dirname(wasmPath);

                    // Best-effort: walk up to find Cargo.toml
                    try {
                        const fs = require('fs');
                        let dir = path.dirname(wasmPath);
                        for (let i = 0; i < 8; i++) {
                            const cargo = path.join(dir, 'Cargo.toml');
                            if (fs.existsSync(cargo)) {
                                contractRootDir = dir;
                                break;
                            }
                            const parent = path.dirname(dir);
                            if (parent === dir) break;
                            dir = parent;
                        }
                    } catch {
                        // ignore
                    }
                } else if (contractDir) {
                    // Build first so signing targets actual WASM
                    operation.report({ percentage: 20, message: 'Building contract...' });
                    outputChannel.appendLine(`\nBuilding contract in: ${contractDir}`);
                    outputChannel.appendLine('Running: stellar contract build\n');

                    const buildResult = await deployer.buildContract(contractDir, {
                        cancellationToken: token,
                        onStdout: (chunk) => {
                            outputChannel.append(chunk);
                            operation.report({
                                percentage: 45,
                                message: 'Building contract...',
                                details: chunk.trim().slice(0, 120),
                            });
                        },
                        onStderr: (chunk) => {
                            outputChannel.append(chunk);
                            operation.report({
                                percentage: 45,
                                message: 'Building contract...',
                                details: chunk.trim().slice(0, 120),
                            });
                        },
                    });

                    if (!buildResult.success) {
                        result = {
                            success: false,
                            error: `Build failed: ${buildResult.output}`,
                            errorSummary: buildResult.errorSummary,
                            errorType: buildResult.errorType,
                            errorCode: buildResult.errorCode,
                            errorSuggestions: buildResult.errorSuggestions,
                            rawError: buildResult.rawError,
                            buildOutput: buildResult.output,
                        };
                    } else {
                        deployableWasmPath = buildResult.wasmPath;
                        contractRootDir = contractDir;

                        if (buildResult.output) {
                            outputChannel.appendLine('=== Build Output ===');
                            outputChannel.appendLine(buildResult.output);
                            outputChannel.appendLine('');
                        }
                    }
                }

                if (!result && !deployableWasmPath) {
                    vscode.window.showErrorMessage('Build succeeded but no WASM output could be located.');
                    return;
                }

                if (!result && deployableWasmPath) {
                    if (!resolvedContractDir) {
                        resolvedContractDir = path.dirname(deployableWasmPath);
                    }
                    const signingPayload = await signingWorkflow.getSigningService()
                        .buildDeploymentSigningPayload({
                            wasmPath: deployableWasmPath,
                            contractDir: resolvedContractDir,
                            cliPath,
                            network,
                            source,
                        });

                    if (token.isCancellationRequested) {
                        operation.cancel('Deployment cancelled by user');
                        outputChannel.appendLine('[Deploy] Cancelled before signing.');
                        return;
                    }

                    operation.report({ percentage: 60, message: 'Signing deployment transaction...' });
                    signingResult = await signingWorkflow.run({
                        payload: signingPayload,
                        defaultMethod: signingConfig.get<DeploymentSigningMethod>(
                            'defaultMethod',
                            'interactive'
                        ),
                        requireValidatedSignature: signingConfig.get<boolean>('requireValidatedSignature', true),
                        enableSecureKeyStorage: signingConfig.get<boolean>('enableSecureKeyStorage', true),
                    });

                    if (!signingResult) {
                        outputChannel.appendLine('[Signing] Workflow cancelled by user.');
                        operation.cancel('Signing workflow cancelled');
                        return;
                    }
                    if (!signingResult.success) {
                        outputChannel.appendLine(`❌ Signing failed: ${signingResult.error}`);
                        operation.fail(signingResult.error || 'Signing failed');
                        vscode.window.showErrorMessage(`Deployment signing failed: ${signingResult.error}`);
                        return;
                    }

                    outputChannel.appendLine(
                        `[Signing] ✅ ${signingResult.method} (${signingResult.status}) ` +
                        `${signingResult.validated ? 'validated' : 'not validated'}`
                    );
                    if (signingResult.publicKey) {
                        outputChannel.appendLine(`[Signing] Signer: ${signingResult.publicKey}`);
                    }
                    outputChannel.appendLine(`[Signing] Payload hash: ${signingResult.payloadHash}`);

                    if (token.isCancellationRequested) {
                        operation.cancel('Deployment cancelled by user');
                        outputChannel.appendLine('[Deploy] Cancelled before submission.');
                        return;
                    }

                    operation.report({ percentage: 75, message: 'Submitting deployment...' });
                    outputChannel.appendLine(`\nDeploying contract from: ${deployableWasmPath}`);
                    result = await deployer.deployFromWasm(deployableWasmPath, {
                        cancellationToken: token,
                        onStdout: (chunk) => {
                            outputChannel.append(chunk);
                            operation.report({
                                percentage: 85,
                                message: 'Submitting deployment...',
                                details: chunk.trim().slice(0, 120),
                            });
                        },
                        onStderr: (chunk) => {
                            outputChannel.append(chunk);
                            operation.report({
                                percentage: 85,
                                message: 'Submitting deployment...',
                                details: chunk.trim().slice(0, 120),
                            });
                        },
                    });
                    result.signing = signingResult;
                }

                if (!result) {
                    vscode.window.showErrorMessage('Deployment did not produce a result.');
                    return;
                }

                operation.report({ percentage: 90, message: 'Finalizing deployment...' });

                // Display results
                outputChannel.appendLine('=== Deployment Result ===');

                if (result.success) {
                    outputChannel.appendLine(`✅ Deployment successful!`);
                    if (result.contractId) {
                        outputChannel.appendLine(`Contract ID: ${result.contractId}`);
                    }
                    if (result.transactionHash) {
                        outputChannel.appendLine(`Transaction Hash: ${result.transactionHash}`);
                    }
                    if (signingResult) {
                        outputChannel.appendLine(
                            `Signing: ${signingResult.method} (${signingResult.status}) · ` +
                            `${signingResult.validated ? 'validated' : 'not validated'}`
                        );
                    }

                    // Store contract ID in workspace state
                    if (result.contractId) {
                        const deployedAt = new Date().toISOString();

                        // Best-effort contract name (Cargo.toml name if available, else directory name).
                        let contractNameForRecord: string;
                        const effectiveContractDir = contractRootDir || resolvedContractDir;

                        if (effectiveContractDir) {
                            try {
                                const fs = require('fs');
                                const cargoPath = path.join(effectiveContractDir, 'Cargo.toml');
                                if (fs.existsSync(cargoPath)) {
                                    const content = fs.readFileSync(cargoPath, 'utf-8');
                                    const match = content.match(/^\s*name\s*=\s*"([^"]+)"/m);
                                    contractNameForRecord = match
                                        ? match[1]
                                        : path.basename(effectiveContractDir);
                                } else {
                                    contractNameForRecord = path.basename(effectiveContractDir);
                                }
                            } catch {
                                contractNameForRecord = path.basename(effectiveContractDir);
                            }
                        } else if (deployableWasmPath) {
                            contractNameForRecord = path.basename(deployableWasmPath);
                        } else {
                            contractNameForRecord = 'unknown';
                        }

                        const deploymentRecord = {
                            contractId: result.contractId,
                            contractName: contractNameForRecord,
                            deployedAt,
                            network,
                            source,
                            transactionHash: result.transactionHash,
                            signingMethod: signingResult?.method,
                            signingValidated: signingResult?.validated,
                            signerPublicKey: signingResult?.publicKey,
                            payloadHash: signingResult?.payloadHash,
                        };

                        const deploymentInfo = {
                            contractId: result.contractId,
                            transactionHash: result.transactionHash,
                            deployedAt,
                            timestamp: deployedAt,
                            network,
                            source,
                            signing: signingResult,
                        };

                        await context.workspaceState.update('lastContractId', result.contractId);
                        await context.workspaceState.update('lastDeployment', deploymentInfo);

                        // Update deployedContracts index
                        const deployedContracts = context.workspaceState.get<Record<string, string>>(
                            'stellarSuite.deployedContracts',
                            {}
                        );
                        if (effectiveContractDir) {
                            deployedContracts[effectiveContractDir] = result.contractId;
                        }
                        await context.workspaceState.update('stellarSuite.deployedContracts', deployedContracts);

                        const deploymentHistory = context.workspaceState.get<any[]>(
                            'stellarSuite.deploymentHistory',
                            []
                        );
                        deploymentHistory.push(deploymentRecord);
                        await context.workspaceState.update('stellarSuite.deploymentHistory', deploymentHistory);

                        try {
                            const tracker = sidebarProvider?.getVersionTracker();
                            if (tracker && effectiveContractDir) {
                                const localVersion = tracker.getLocalVersion(effectiveContractDir);
                                if (localVersion) {
                                    await tracker.recordDeployedVersion(
                                        path.join(effectiveContractDir, 'Cargo.toml'),
                                        contractNameForRecord,
                                        localVersion,
                                        {
                                            contractId: result.contractId,
                                            network,
                                            source,
                                        }
                                    );
                                }
                            }
                        } catch {
                            // ignore
                        }


                        // Update sidebar view
                        if (sidebarProvider) {
                            sidebarProvider.showDeploymentResult(deploymentRecord);
                        }

                        // Show success notification with contract ID
                        const signingSummary = signingResult
                            ? `\nSigning: ${signingResult.method} (${signingResult.validated ? 'validated' : signingResult.status})`
                            : '';
                        const action = await vscode.window.showInformationMessage(
                            `Contract deployed successfully!\nContract ID: ${result.contractId}${signingSummary}`,
                            'Copy Contract ID',
                            'Use for Simulation'
                        );

                        if (action === 'Copy Contract ID' && result.contractId) {
                            await vscode.env.clipboard.writeText(result.contractId);
                            vscode.window.showInformationMessage('Contract ID copied to clipboard');
                        } else if (action === 'Use for Simulation') {
                            // Could trigger simulation command here
                            vscode.commands.executeCommand('stellarSuite.simulateTransaction');
                        }
                    }
                    operation.succeed('Deployment completed successfully', result.contractId);
                } else if (
                    token.isCancellationRequested ||
                    result.errorSummary?.toLowerCase().includes('cancelled') ||
                    result.error?.toLowerCase().includes('cancelled')
                ) {
                    outputChannel.appendLine('⚠️ Deployment cancelled by user.');
                    operation.cancel('Deployment cancelled by user');
                    vscode.window.showWarningMessage('Contract deployment cancelled.');
                } else {
                    outputChannel.appendLine(`❌ Deployment failed!`);
                    outputChannel.appendLine(`Error: ${result.error || 'Unknown error'}`);
                    if (result.errorCode) {
                        outputChannel.appendLine(`Error Code: ${result.errorCode}`);
                    }
                    if (result.errorType) {
                        outputChannel.appendLine(`Error Type: ${result.errorType}`);
                    }
                    if (result.errorSuggestions && result.errorSuggestions.length > 0) {
                        outputChannel.appendLine('Suggestions:');
                        for (const suggestion of result.errorSuggestions) {
                            outputChannel.appendLine(`- ${suggestion}`);
                        }
                    }

                    if (result.deployOutput) {
                        outputChannel.appendLine('\n=== Deployment Output ===');
                        outputChannel.appendLine(result.deployOutput);
                    }
                    if (result.buildOutput) {
                        outputChannel.appendLine('\n=== Build Output ===');
                        outputChannel.appendLine(result.buildOutput);
                    }

                    const notificationMessage = result.errorSummary
                        ? `Deployment failed: ${result.errorSummary}`
                        : `Deployment failed: ${result.error}`;
                    operation.fail(result.errorSummary ?? result.error ?? 'Deployment failed', notificationMessage);
                    vscode.window.showErrorMessage(notificationMessage);
                }
                } finally {
                    progressSubscription.dispose();
                }
            }
        );
    } catch (error) {
        const formatted = formatError(error, 'Deployment');
        operation.fail(formatted.message, formatted.title);
        vscode.window.showErrorMessage(`${formatted.title}: ${formatted.message}`);
    } finally {
        operation.dispose();
        statusBar.dispose();
    }
}
