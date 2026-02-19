import * as vscode from 'vscode';
import { simulateTransaction } from './commands/simulateTransaction';
import { deployContract } from './commands/deployContract';
import { buildContract } from './commands/buildContract';
import { registerRpcLoggingCommands } from './commands/rpcLoggingCommands';
import { SidebarViewProvider } from './ui/sidebarView';
import { RpcLogger } from './services/rpcLogger';

let sidebarProvider: SidebarViewProvider | undefined;
let rpcLogger: RpcLogger | undefined;

export function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel('Stellar Suite');
    outputChannel.appendLine('[Extension] Activating Stellar Suite extension...');
    console.log('[Stellar Suite] Extension activating...');

    try {
        // Initialize RPC Logger
        rpcLogger = new RpcLogger({
            level: require('vscode').workspace.getConfiguration('stellarSuite').get('rpcLogLevel') || 'INFO',
            maskSensitiveData: true,
            enableConsoleOutput: true,
            context,
        });

        rpcLogger.loadLogs().then(() => {
            outputChannel.appendLine('[Extension] RPC Logger initialized and logs loaded');
        });

        // Register RPC logging commands
        registerRpcLoggingCommands(context, rpcLogger);
        outputChannel.appendLine('[Extension] RPC logging commands registered');

        sidebarProvider = new SidebarViewProvider(context.extensionUri, context);
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(SidebarViewProvider.viewType, sidebarProvider)
        );
        outputChannel.appendLine('[Extension] Sidebar view provider registered');
        console.log('[Stellar Suite] Sidebar view provider registered');

    const simulateCommand = vscode.commands.registerCommand(
        'stellarSuite.simulateTransaction',
        () => {
            return simulateTransaction(context, sidebarProvider);
        }
    );

    const deployCommand = vscode.commands.registerCommand(
        'stellarSuite.deployContract',
        () => {
            return deployContract(context, sidebarProvider);
        }
    );

    const refreshCommand = vscode.commands.registerCommand(
        'stellarSuite.refreshContracts',
        () => {
            if (sidebarProvider) {
                sidebarProvider.refresh();
            } else {
                outputChannel.appendLine('[Extension] WARNING: sidebarProvider not available for refresh');
            }
        }
    );

    const deployFromSidebarCommand = vscode.commands.registerCommand(
        'stellarSuite.deployFromSidebar',
        () => {
            return deployContract(context, sidebarProvider);
        }
    );

    const simulateFromSidebarCommand = vscode.commands.registerCommand(
        'stellarSuite.simulateFromSidebar',
        () => {
            return simulateTransaction(context, sidebarProvider);
        }
    );

    const buildCommand = vscode.commands.registerCommand(
        'stellarSuite.buildContract',
        () => {
            return buildContract(context, sidebarProvider);
        }
    );

    outputChannel.appendLine('[Extension] All commands registered');
    console.log('[Stellar Suite] All commands registered');

    vscode.commands.getCommands().then(commands => {
        const stellarCommands = commands.filter(c => c.startsWith('stellarSuite.'));
        outputChannel.appendLine(`[Extension] Registered commands: ${stellarCommands.join(', ')}`);
        console.log('[Stellar Suite] Registered commands:', stellarCommands);
    });

    const watcher = vscode.workspace.createFileSystemWatcher('**/{Cargo.toml,*.wasm}');
    watcher.onDidChange(() => {
        if (sidebarProvider) {
            sidebarProvider.refresh();
        }
    });
    watcher.onDidCreate(() => {
        if (sidebarProvider) {
            sidebarProvider.refresh();
        }
    });
    watcher.onDidDelete(() => {
        if (sidebarProvider) {
            sidebarProvider.refresh();
        }
    });

    context.subscriptions.push(
        simulateCommand,
        deployCommand,
        refreshCommand,
        deployFromSidebarCommand,
        simulateFromSidebarCommand,
        buildCommand,
        watcher
    );

    outputChannel.appendLine('[Extension] Extension activation complete');
    console.log('[Stellar Suite] Extension activation complete');
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`[Extension] ERROR during activation: ${errorMsg}`);
        if (error instanceof Error && error.stack) {
            outputChannel.appendLine(`[Extension] Stack: ${error.stack}`);
        }
        console.error('[Stellar Suite] Activation error:', error);
        vscode.window.showErrorMessage(`Stellar Suite activation failed: ${errorMsg}`);
    }
}

export function deactivate() {
}
