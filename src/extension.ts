// ============================================================
// src/extension.ts
// Extension entry point — activates commands, sidebar, and watchers.
// ============================================================

import * as vscode from 'vscode';
import { simulateTransaction } from './commands/simulateTransaction';
import { deployContract }      from './commands/deployContract';
import { buildContract }       from './commands/buildContract';
import { manageCliConfiguration } from './commands/manageCliConfiguration';
import { SidebarViewProvider } from './ui/sidebarView';

let sidebarProvider: SidebarViewProvider | undefined;

export function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel('Stellar Suite');
    outputChannel.appendLine('[Extension] Activating Stellar Suite extension...');
    console.log('[Stellar Suite] Extension activating...');

    try {
        // ── Sidebar ───────────────────────────────────────────
        sidebarProvider = new SidebarViewProvider(context.extensionUri, context);
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(
                SidebarViewProvider.viewType,
                sidebarProvider
            )
        );
        outputChannel.appendLine('[Extension] Sidebar view provider registered');

        // ── Core commands ─────────────────────────────────────
        const simulateCommand = vscode.commands.registerCommand(
            'stellarSuite.simulateTransaction',
            () => simulateTransaction(context, sidebarProvider)
        );

        const deployCommand = vscode.commands.registerCommand(
            'stellarSuite.deployContract',
            () => deployContract(context, sidebarProvider)
        );

        const buildCommand = vscode.commands.registerCommand(
            'stellarSuite.buildContract',
            () => buildContract(context, sidebarProvider)
        );

        const configureCliCommand = vscode.commands.registerCommand(
            'stellarSuite.configureCli',
            () => manageCliConfiguration(context)
        );

        const refreshCommand = vscode.commands.registerCommand(
            'stellarSuite.refreshContracts',
            () => {
                if (sidebarProvider) {
                    sidebarProvider.refresh();
                } else {
                    outputChannel.appendLine('[Extension] WARNING: sidebarProvider not available');
                }
            }
        );

        const deployFromSidebarCommand = vscode.commands.registerCommand(
            'stellarSuite.deployFromSidebar',
            () => deployContract(context, sidebarProvider)
        );

        const simulateFromSidebarCommand = vscode.commands.registerCommand(
            'stellarSuite.simulateFromSidebar',
            () => simulateTransaction(context, sidebarProvider)
        );

        // ── Context menu commands (callable from Command Palette) ──
        //
        // These mirror the context menu actions so power users can
        // also trigger them via Ctrl+Shift+P.

        const copyContractIdCommand = vscode.commands.registerCommand(
            'stellarSuite.copyContractId',
            async () => {
                // Prompt for contract ID if invoked from palette (no webview context)
                const id = await vscode.window.showInputBox({
                    title: 'Copy Contract ID',
                    prompt: 'Enter the contract ID to copy to clipboard',
                });
                if (id) {
                    await vscode.env.clipboard.writeText(id);
                    vscode.window.showInformationMessage('Contract ID copied to clipboard.');
                }
            }
        );

        outputChannel.appendLine('[Extension] All commands registered');

        // ── File watcher ──────────────────────────────────────
        const watcher = vscode.workspace.createFileSystemWatcher('**/{Cargo.toml,*.wasm}');
        const refreshOnChange = () => sidebarProvider?.refresh();
        watcher.onDidChange(refreshOnChange);
        watcher.onDidCreate(refreshOnChange);
        watcher.onDidDelete(refreshOnChange);

        // ── Example: registering a custom context action ──────
        // This demonstrates the extensibility API. Other extensions
        // or future features can add their own sidebar context actions.
        //
        // const customActionDisposable = registerCustomContextAction({
        //     action: {
        //         id: 'myCustomAction',
        //         label: 'Run Custom Script',
        //         icon: 'terminal',
        //         enabled: true,
        //         separatorBefore: true,
        //     },
        //     insertBefore: 'delete',
        //     handler: async (contract, ctx) => {
        //         vscode.window.showInformationMessage(`Custom action on ${contract.name}`);
        //         return { type: 'success', message: 'Custom action complete.' };
        //     },
        // });
        // context.subscriptions.push(customActionDisposable);

        context.subscriptions.push(
            simulateCommand,
            deployCommand,
            buildCommand,
            configureCliCommand,
            refreshCommand,
            deployFromSidebarCommand,
            simulateFromSidebarCommand,
            copyContractIdCommand,
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

export function deactivate() {}
