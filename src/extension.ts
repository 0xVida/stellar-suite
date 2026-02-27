import * as vscode from 'vscode';
import { simulateTransaction } from './commands/simulateTransaction';
import { deployContract } from './commands/deployContract';
import { buildContract } from './commands/buildContract';
import { SidebarViewProvider } from './ui/sidebarView';
import { getSharedOutputChannel } from './utils/outputChannel';
import { ContractGroupService } from './services/contractGroupService';
import { registerCustomContextAction } from './services/contextMenuService';

let sidebarProvider: SidebarViewProvider | undefined;
let groupService: ContractGroupService | undefined;

function registerGroupCommands(context: vscode.ExtensionContext, groupService: ContractGroupService) {
    // Implementation to be added from the contract group service
    // This would include commands for managing contract groups
    return groupService;
}

export function activate(context: vscode.ExtensionContext) {
    const outputChannel = getSharedOutputChannel();

    try {
        // Initialize contract group service
        groupService = new ContractGroupService(context);
        groupService.loadGroups().then(() => {
            outputChannel.appendLine('[Extension] Contract group service initialized');
        });

        // Register group commands
        registerGroupCommands(context, groupService);
        outputChannel.appendLine('[Extension] Group commands registered');

        sidebarProvider = new SidebarViewProvider(context.extensionUri, context, groupService);
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(SidebarViewProvider.viewType, sidebarProvider)
        );

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
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Stellar Kit activation failed: ${errorMsg}`);
    }
}

export function deactivate() { }