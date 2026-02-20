import * as vscode from 'vscode';
import { ContractDeployer } from '../services/contractDeployer';
import { WasmDetector } from '../utils/wasmDetector';
import { formatError } from '../utils/errorFormatter';
import { SidebarViewProvider } from '../ui/sidebarView';
import { resolveCliConfigurationForCommand } from '../services/cliConfigurationVscode';
import { CompilationStatusMonitor } from '../services/compilationStatusMonitor';
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

export async function buildContract(
    context: vscode.ExtensionContext,
    sidebarProvider?: SidebarViewProvider,
    monitor?: CompilationStatusMonitor
) {
    const progressService = new ProgressIndicatorService();
    const operation = progressService.createOperation({
        id: `build-${Date.now()}`,
        title: 'Build Contract',
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

        const outputChannel = vscode.window.createOutputChannel('Stellar Suite - Build');
        outputChannel.show(true);
        outputChannel.appendLine('=== Stellar Contract Build ===\n');

        const selectedContractPath = context.workspaceState.get<string>('selectedContractPath');

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Building Contract',
                cancellable: true,
            },
            async (
                progress: vscode.Progress<{ message?: string; increment?: number }>,
                token: vscode.CancellationToken
            ) => {
                operation.start('Preparing build...');
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
                        operation.report({ percentage: 10, message: 'Scanning workspace for contracts...' });
                        const contractDirs = await WasmDetector.findContractDirectories();
                        outputChannel.appendLine(`Found ${contractDirs.length} contract directory(ies) in workspace`);

                        if (contractDirs.length === 0) {
                            operation.fail('No contract directories found in workspace');
                            vscode.window.showErrorMessage('No contract directories found in workspace');
                            return;
                        }

                        if (contractDirs.length === 1) {
                            contractDir = contractDirs[0];
                        } else {
                            const selected = await vscode.window.showQuickPick(
                                contractDirs.map(dir => ({
                                    label: require('path').basename(dir),
                                    description: dir,
                                    value: dir,
                                })),
                                {
                                    placeHolder: 'Select contract to build',
                                }
                            );
                            if (!selected) {
                                operation.cancel('Build cancelled: no contract selected');
                                return;
                            }
                            contractDir = selected.value;
                        }
                    }

                    if (!contractDir) {
                        operation.fail('No contract directory selected');
                        vscode.window.showErrorMessage('No contract directory selected');
                        return;
                    }

                    if (monitor) {
                        monitor.startCompilation(contractDir);
                    }

                    operation.report({ percentage: 30, message: 'Building contract...', details: contractDir });
                    if (monitor) {
                        monitor.updateProgress(contractDir, 30, 'Running stellar contract build...');
                    }

                    outputChannel.appendLine(`\nBuilding contract in: ${contractDir}`);
                    outputChannel.appendLine('Running: stellar contract build\n');

                    const deployer = new ContractDeployer(cliPath, source, network);
                    let lastProgressUpdate = 0;
                    let streamingProgress = 35;

                    const updateStreamingStatus = (chunk: string): void => {
                        const trimmed = chunk
                            .split('\n')
                            .map(line => line.trim())
                            .filter(line => line.length > 0)
                            .pop();
                        if (!trimmed) {
                            return;
                        }

                        const now = Date.now();
                        if (now - lastProgressUpdate < 500) {
                            return;
                        }
                        lastProgressUpdate = now;

                        if (/\bfinished\b/i.test(trimmed)) {
                            streamingProgress = Math.max(streamingProgress, 80);
                        } else if (/\bcompiling\b/i.test(trimmed)) {
                            streamingProgress = Math.max(streamingProgress, 55);
                        } else {
                            streamingProgress = Math.min(78, streamingProgress + 1);
                        }

                        const statusMessage = trimmed.length > 100
                            ? `${trimmed.slice(0, 99)}…`
                            : trimmed;

                        operation.report({
                            percentage: streamingProgress,
                            message: 'Compiling contract output...',
                            details: statusMessage,
                        });

                        if (monitor) {
                            monitor.updateProgress(contractDir!, streamingProgress, `Streaming build output: ${statusMessage}`);
                        }
                    };

                    const buildResult = await deployer.buildContract(contractDir, {
                        cancellationToken: token,
                        onStdout: (chunk) => {
                            outputChannel.append(chunk);
                            updateStreamingStatus(chunk);
                        },
                        onStderr: (chunk) => {
                            outputChannel.append(chunk);
                            updateStreamingStatus(chunk);
                        },
                    });

                    operation.report({ percentage: 90, message: 'Finalizing build result...' });

                    if (monitor) {
                        monitor.updateProgress(contractDir, 90, 'Finalizing build...');
                    }

                    outputChannel.appendLine('=== Build Result ===');

                    if (buildResult.success) {
                        outputChannel.appendLine('✅ Build successful!');
                        if (buildResult.wasmPath) {
                            outputChannel.appendLine(`WASM file: ${buildResult.wasmPath}`);
                        }

                        if (monitor) {
                            monitor.reportSuccess(contractDir, buildResult.wasmPath, buildResult.output);
                        }

                        operation.succeed('Build completed successfully', buildResult.wasmPath);
                        vscode.window.showInformationMessage('Contract built successfully!');

                        if (sidebarProvider) {
                            await sidebarProvider.refresh();
                        }
                    } else if (buildResult.cancelled || token.isCancellationRequested) {
                        outputChannel.appendLine('⚠️ Build cancelled by user.');
                        if (monitor) {
                            monitor.reportCancellation(contractDir);
                        }
                        operation.cancel('Build cancelled by user');
                        vscode.window.showWarningMessage('Contract build cancelled.');
                    } else {
                        outputChannel.appendLine('❌ Build failed!');
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

                        const diagnostics = monitor ? monitor.parseDiagnostics(buildResult.output, contractDir) : [];

                        if (monitor) {
                            monitor.reportFailure(contractDir, buildResult.output, diagnostics, buildResult.output);
                        }

                        const notificationMessage = buildResult.errorSummary
                            ? `Build failed: ${buildResult.errorSummary}`
                            : `Build failed: ${buildResult.output}`;
                        operation.fail(buildResult.errorSummary ?? buildResult.output, notificationMessage);
                        vscode.window.showErrorMessage(notificationMessage);
                    }
                } finally {
                    progressSubscription.dispose();
                }
            }
        );
    } catch (error) {
        const formatted = formatError(error, 'Build');
        operation.fail(formatted.message, formatted.title);
        vscode.window.showErrorMessage(`${formatted.title}: ${formatted.message}`);
        console.error('[Build] Error:', error);
    } finally {
        operation.dispose();
        statusBar.dispose();
    }
}
