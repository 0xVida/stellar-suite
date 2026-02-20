import * as vscode from 'vscode';
import { RpcLogger, LogLevel } from '../services/rpcLogger';
import * as path from 'path';

/**
 * Register RPC logging commands
 */
export function registerRpcLoggingCommands(context: vscode.ExtensionContext, logger: RpcLogger) {
    const outputChannel = vscode.window.createOutputChannel('Stellar Suite - RPC Logs');

    const viewLogsCommand = vscode.commands.registerCommand(
        'stellarSuite.viewRpcLogs',
        async () => {
            try {
                outputChannel.show();
                const logs = logger.getLogs();
                outputChannel.clear();
                outputChannel.appendLine(`=== RPC Logs (Total: ${logs.length}) ===\n`);

                logs.slice(-100).forEach(log => {
                    const timestamp = new Date(log.timestamp).toISOString();
                    const duration = log.duration ? ` (${log.duration}ms)` : '';
                    outputChannel.appendLine(
                        `[${timestamp}] [${log.level}] ${log.type} - ${log.method || 'N/A'}${duration}`
                    );
                    if (log.error) {
                        outputChannel.appendLine(`  Error: ${log.error}`);
                    }
                });

                outputChannel.appendLine('\n=== End of logs ===');
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Failed to view RPC logs: ${error instanceof Error ? error.message : 'Unknown error'}`
                );
            }
        }
    );

    const exportLogsJsonCommand = vscode.commands.registerCommand(
        'stellarSuite.exportRpcLogsJson',
        async () => {
            try {
                const json = logger.exportAsJson();
                const fileName = `rpc-logs-${Date.now()}.json`;
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

                if (!workspaceFolder) {
                    vscode.window.showErrorMessage('No workspace folder open');
                    return;
                }

                const filePath = vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, fileName));
                await vscode.workspace.fs.writeFile(filePath, Buffer.from(json, 'utf8'));
                vscode.window.showInformationMessage(`RPC logs exported to ${fileName}`);
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Failed to export logs: ${error instanceof Error ? error.message : 'Unknown error'}`
                );
            }
        }
    );

    const exportLogsCsvCommand = vscode.commands.registerCommand(
        'stellarSuite.exportRpcLogsCsv',
        async () => {
            try {
                const csv = logger.exportAsCsv();
                const fileName = `rpc-logs-${Date.now()}.csv`;
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

                if (!workspaceFolder) {
                    vscode.window.showErrorMessage('No workspace folder open');
                    return;
                }

                const filePath = vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, fileName));
                await vscode.workspace.fs.writeFile(filePath, Buffer.from(csv, 'utf8'));
                vscode.window.showInformationMessage(`RPC logs exported to ${fileName}`);
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Failed to export logs: ${error instanceof Error ? error.message : 'Unknown error'}`
                );
            }
        }
    );

    const viewTimingStatsCommand = vscode.commands.registerCommand(
        'stellarSuite.viewRpcTimingStats',
        async () => {
            try {
                const stats = logger.getTimingStats();

                if (stats.length === 0) {
                    vscode.window.showInformationMessage('No timing data available');
                    return;
                }

                outputChannel.show();
                outputChannel.clear();
                outputChannel.appendLine('=== RPC Timing Statistics ===\n');

                stats.forEach(stat => {
                    outputChannel.appendLine(`Method: ${stat.method}`);
                    outputChannel.appendLine(`  Count: ${stat.count}`);
                    outputChannel.appendLine(`  Avg Duration: ${stat.avgDuration}ms`);
                    outputChannel.appendLine(`  Min Duration: ${stat.minDuration}ms`);
                    outputChannel.appendLine(`  Max Duration: ${stat.maxDuration}ms`);
                    outputChannel.appendLine('');
                });

                outputChannel.appendLine('=== End of stats ===');
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Failed to view timing stats: ${error instanceof Error ? error.message : 'Unknown error'}`
                );
            }
        }
    );

    const viewErrorStatsCommand = vscode.commands.registerCommand(
        'stellarSuite.viewRpcErrorStats',
        async () => {
            try {
                const stats = logger.getErrorStats();

                if (stats.length === 0) {
                    vscode.window.showInformationMessage('No error data available');
                    return;
                }

                outputChannel.show();
                outputChannel.clear();
                outputChannel.appendLine('=== RPC Error Statistics ===\n');

                stats.forEach(stat => {
                    outputChannel.appendLine(`Method: ${stat.method}`);
                    outputChannel.appendLine(`  Error Count: ${stat.count}`);
                    outputChannel.appendLine('  Errors:');
                    stat.errors.forEach(error => {
                        outputChannel.appendLine(`    - ${error}`);
                    });
                    outputChannel.appendLine('');
                });

                outputChannel.appendLine('=== End of stats ===');
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Failed to view error stats: ${error instanceof Error ? error.message : 'Unknown error'}`
                );
            }
        }
    );

    const setLogLevelCommand = vscode.commands.registerCommand(
        'stellarSuite.setRpcLogLevel',
        async () => {
            try {
                const level = await vscode.window.showQuickPick(
                    Object.values(LogLevel),
                    {
                        placeHolder: 'Select log level',
                    }
                );

                if (level) {
                    logger.setLogLevel(level as LogLevel);
                    vscode.window.showInformationMessage(`RPC log level set to ${level}`);
                }
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Failed to set log level: ${error instanceof Error ? error.message : 'Unknown error'}`
                );
            }
        }
    );

    const toggleSensitiveDataMaskingCommand = vscode.commands.registerCommand(
        'stellarSuite.toggleRpcSensitiveDataMasking',
        async () => {
            try {
                const enabled = !logger.isSensitiveDataMaskingEnabled();
                logger.setSensitiveDataMasking(enabled);
                vscode.window.showInformationMessage(
                    `Sensitive data masking ${enabled ? 'enabled' : 'disabled'}`
                );
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Failed to toggle masking: ${error instanceof Error ? error.message : 'Unknown error'}`
                );
            }
        }
    );

    const clearRpcLogsCommand = vscode.commands.registerCommand(
        'stellarSuite.clearRpcLogs',
        async () => {
            try {
                const confirm = await vscode.window.showWarningMessage(
                    'Clear all RPC logs?',
                    'Yes',
                    'No'
                );

                if (confirm === 'Yes') {
                    logger.clearAll();
                    vscode.window.showInformationMessage('RPC logs cleared');
                }
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Failed to clear logs: ${error instanceof Error ? error.message : 'Unknown error'}`
                );
            }
        }
    );

    context.subscriptions.push(
        viewLogsCommand,
        exportLogsJsonCommand,
        exportLogsCsvCommand,
        viewTimingStatsCommand,
        viewErrorStatsCommand,
        setLogLevelCommand,
        toggleSensitiveDataMaskingCommand,
        clearRpcLogsCommand
    );

    outputChannel.appendLine('[RPC Logging] All commands registered successfully');
}
