import * as vscode from 'vscode';
import { ContractDeployer } from '../services/contractDeployer';
import { WasmDetector } from '../utils/wasmDetector';
import { formatError } from '../utils/errorFormatter';
import { SidebarViewProvider } from '../ui/sidebarView';
import { resolveCliConfigurationForCommand } from '../services/cliConfigurationVscode';
import { CompilationStatusMonitor } from '../services/compilationStatusMonitor';
import { CompilationDiagnosticSeverity } from '../types/compilationStatus';

export async function buildContract(
    context: vscode.ExtensionContext, 
    sidebarProvider?: SidebarViewProvider,
    monitor?: CompilationStatusMonitor
) {
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

        const outputChannel = vscode.window.createOutputChannel('Stellar Suite - Build');
        outputChannel.show(true);
        outputChannel.appendLine('=== Stellar Contract Build ===\n');
        console.log('[Build] Starting build...');

        const selectedContractPath = context.workspaceState.get<string>('selectedContractPath');
        
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Building Contract',
                cancellable: false
            },
            async (progress: vscode.Progress<{ message?: string; increment?: number }>) => {
                progress.report({ increment: 0, message: 'Detecting contract...' });

                let contractDir: string | null = null;

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

                // If no selected path, try to detect
                if (!contractDir) {
                    progress.report({ increment: 10, message: 'Searching workspace...' });
                    const contractDirs = await WasmDetector.findContractDirectories();
                    outputChannel.appendLine(`Found ${contractDirs.length} contract directory(ies) in workspace`);

                    if (contractDirs.length === 0) {
                        vscode.window.showErrorMessage('No contract directories found in workspace');
                        return;
                    } else if (contractDirs.length === 1) {
                        contractDir = contractDirs[0];
                    } else {
                        // Multiple contracts - show picker
                        const selected = await vscode.window.showQuickPick(
                            contractDirs.map(dir => ({
                                label: require('path').basename(dir),
                                description: dir,
                                value: dir
                            })),
                            {
                                placeHolder: 'Select contract to build'
                            }
                        );
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

                // Start compilation monitoring
                if (monitor) {
                    monitor.startCompilation(contractDir);
                }

                // Build the contract
                progress.report({ increment: 30, message: 'Building contract...' });
                
                if (monitor) {
                    monitor.updateProgress(contractDir, 30, 'Running stellar contract build...');
                }
                
                outputChannel.appendLine(`\nBuilding contract in: ${contractDir}`);
                outputChannel.appendLine('Running: stellar contract build\n');

                const deployer = new ContractDeployer(cliPath, source, network);
                const buildResult = await deployer.buildContract(contractDir);

                progress.report({ increment: 90, message: 'Finalizing...' });
                
                if (monitor) {
                    monitor.updateProgress(contractDir, 90, 'Finalizing build...');
                }

                // Display results and update monitor
                outputChannel.appendLine('=== Build Result ===');
                
                if (buildResult.success) {
                    outputChannel.appendLine(`✅ Build successful!`);
                    if (buildResult.wasmPath) {
                        outputChannel.appendLine(`WASM file: ${buildResult.wasmPath}`);
                    }
                    
                    // Report success to monitor
                    if (monitor) {
                        monitor.reportSuccess(contractDir, buildResult.wasmPath, buildResult.output);
                    }
                    
                    vscode.window.showInformationMessage('Contract built successfully!');
                    
                    // Refresh sidebar
                    if (sidebarProvider) {
                        await sidebarProvider.refresh();
                    }
                } else {
                    outputChannel.appendLine(`❌ Build failed!`);
                    outputChannel.appendLine(`Error: ${buildResult.output}`);
                    if (buildResult.errorCode) {
                        outputChannel.appendLine(`Error Code: ${buildResult.errorCode}`);
                    }
                    if (buildResult.errorType) {
                        outputChannel.appendLine(`Error Type: ${buildResult.errorType}`);
                    }
                    if (buildResult.errorSuggestions && buildResult.errorSuggestions.length > 0) {
                        outputChannel.appendLine('Suggestions:');
                        for (const suggestion of buildResult.errorSuggestions) {
                            outputChannel.appendLine(`- ${suggestion}`);
                        }
                    }

                    // Parse and report diagnostics to monitor
                    const diagnostics = monitor ? monitor.parseDiagnostics(buildResult.output, contractDir) : [];
                    
                    // Report failure to monitor
                    if (monitor) {
                        monitor.reportFailure(contractDir, buildResult.output, diagnostics, buildResult.output);
                    }

                    const notificationMessage = buildResult.errorSummary
                        ? `Build failed: ${buildResult.errorSummary}`
                        : `Build failed: ${buildResult.output}`;
                    vscode.window.showErrorMessage(notificationMessage);
                }

                progress.report({ increment: 100, message: 'Complete' });
            }
        );
    } catch (error) {
        const formatted = formatError(error, 'Build');
        vscode.window.showErrorMessage(`${formatted.title}: ${formatted.message}`);
        console.error('[Build] Error:', error);
    }
}
