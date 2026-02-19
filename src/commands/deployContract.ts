import * as vscode from 'vscode';
import { ContractDeployer } from '../services/contractDeployer';
import { WasmDetector } from '../utils/wasmDetector';
import { formatError } from '../utils/errorFormatter';
import { SidebarViewProvider } from '../ui/sidebarView';
import * as path from 'path';
import { resolveCliConfigurationForCommand } from '../services/cliConfigurationVscode';

export async function deployContract(context: vscode.ExtensionContext, sidebarProvider?: SidebarViewProvider) {
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
                cancellable: false
            },
            async (progress: vscode.Progress<{ message?: string; increment?: number }>) => {
                progress.report({ increment: 0, message: 'Detecting contract...' });

                let contractDir: string | null = null;
                let wasmPath: string | null = null;
                let deployFromWasm = false;

                progress.report({ increment: 10, message: 'Searching workspace...' });
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

                let result;

                if (deployFromWasm && wasmPath) {
                    // Deploy directly from WASM
                    progress.report({ increment: 30, message: 'Deploying from WASM...' });
                    outputChannel.appendLine(`\nDeploying contract from: ${wasmPath}`);
                    result = await deployer.deployFromWasm(wasmPath);
                } else if (contractDir) {
                    // Build and deploy
                    progress.report({ increment: 10, message: 'Building contract...' });
                    outputChannel.appendLine(`\nBuilding contract in: ${contractDir}`);
                    outputChannel.appendLine('Running: stellar contract build\n');
                    
                    result = await deployer.buildAndDeploy(contractDir);
                    
                    if (result.buildOutput) {
                        outputChannel.appendLine('=== Build Output ===');
                        outputChannel.appendLine(result.buildOutput);
                        outputChannel.appendLine('');
                    }
                } else {
                    vscode.window.showErrorMessage('Invalid deployment configuration');
                    return;
                }

                progress.report({ increment: 90, message: 'Finalizing...' });

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

                    // Store contract ID in workspace state
                    if (result.contractId) {
                        const deploymentInfo = {
                            contractId: result.contractId,
                            transactionHash: result.transactionHash,
                            timestamp: new Date().toISOString(),
                            network,
                            source
                        };
                        
                        context.workspaceState.update('lastContractId', result.contractId);
                        context.workspaceState.update('lastDeployment', deploymentInfo);

                        // Update sidebar view
                        if (sidebarProvider) {
                            sidebarProvider.showDeploymentResult(deploymentInfo);
                        }

                        // Show success notification with contract ID
                        const action = await vscode.window.showInformationMessage(
                            `Contract deployed successfully!\nContract ID: ${result.contractId}`,
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

                    const notificationMessage = result.errorSummary
                        ? `Deployment failed: ${result.errorSummary}`
                        : `Deployment failed: ${result.error}`;
                    vscode.window.showErrorMessage(notificationMessage);
                }

                progress.report({ increment: 100, message: 'Complete' });
            }
        );
    } catch (error) {
        const formatted = formatError(error, 'Deployment');
        vscode.window.showErrorMessage(`${formatted.title}: ${formatted.message}`);
    }
}
