import * as vscode from 'vscode';
import { simulateTransaction } from './commands/simulateTransaction';
import { deployContract } from './commands/deployContract';
import { buildContract } from './commands/buildContract';
import { installCli } from './commands/installCli';
import { switchNetwork } from './commands/switchNetwork';
import { keysGenerate, keysFund, keysList } from './commands/keyManager';
import { generateBindings } from './commands/generateBindings';
import { runInvoke } from './commands/runInvoke';
import { contractInfo } from './commands/contractInfo';
import { analyzeSecurity } from './commands/analyzeSecurity';
import { showNetworkHealth } from './commands/showNetworkHealth';
import { initNetworkStatusBar, disposeNetworkStatusBar } from './ui/networkStatusBar';
import { initIdentityStatusBar } from './ui/identityStatusBar';
import { SidebarViewProvider } from './ui/sidebarView';
import { ContractInvokeViewProvider } from './views/ContractInvokeView';
import { AccountBalanceViewProvider } from './views/AccountBalanceView';
import { registerOpenInWebIDECommand } from './commands/OpenInWebIDE';
import { getSharedOutputChannel } from './utils/outputChannel';
import { SorobanCliService } from './services/sorobanCliService';

let sidebarProvider: SidebarViewProvider | undefined;

export async function activate(context: vscode.ExtensionContext) {
    const outputChannel = getSharedOutputChannel();

    try {
        sidebarProvider = new SidebarViewProvider(context.extensionUri, context);
        const contractInvokeProvider = new ContractInvokeViewProvider(context.extensionUri);
        const accountBalanceProvider = new AccountBalanceViewProvider(context.extensionUri);
        
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(SidebarViewProvider.viewType, sidebarProvider),
            vscode.window.registerWebviewViewProvider(ContractInvokeViewProvider.viewType, contractInvokeProvider),
            vscode.window.registerWebviewViewProvider(AccountBalanceViewProvider.viewType, accountBalanceProvider)
        );
        
        registerOpenInWebIDECommand(context);

        outputChannel.appendLine('[Extension] Checking for Stellar CLI in PATH...');
        const cliPath = await SorobanCliService.findCliPath();
        if (!cliPath) {
            outputChannel.appendLine('[Extension] WARNING: Stellar CLI is not installed or not found in PATH.');
            vscode.window.showInformationMessage(
                'Stellar CLI is not installed or not found in PATH.',
                'Install Stellar CLI'
            ).then(selection => {
                if (selection === 'Install Stellar CLI') {
                    vscode.commands.executeCommand('stellarSuite.installCli');
                }
            });
        } else {
            outputChannel.appendLine(`[Extension] SUCCESS: Found Stellar CLI at: ${cliPath}`);
            await initNetworkStatusBar(context);
            await initIdentityStatusBar(context);
        }

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
            (args) => {
                return buildContract(context, sidebarProvider, args);
            }
        );

        const installCliCommand = vscode.commands.registerCommand(
            'stellarSuite.installCli',
            () => {
                return installCli(context);
            }
        );

        const switchNetworkCommand = vscode.commands.registerCommand(
            'stellarSuite.switchNetwork',
            () => {
                return switchNetwork();
            }
        );

        const keysGenerateCommand = vscode.commands.registerCommand('stellarSuite.keysGenerate', () => keysGenerate());
        const keysFundCommand = vscode.commands.registerCommand('stellarSuite.keysFund', () => keysFund());
        const keysListCommand = vscode.commands.registerCommand('stellarSuite.keysList', () => keysList());

        const generateBindingsCommand = vscode.commands.registerCommand('stellarSuite.generateBindings', (item) => {
            return generateBindings(item);
        });

        const runInvokeCommand = vscode.commands.registerCommand('stellarSuite.runInvoke', (args) => {
            return runInvoke(context, sidebarProvider, args);
        });

        const contractInfoCommand = vscode.commands.registerCommand('stellarSuite.contractInfo', (args) => {
            return contractInfo(context, args);
        });

        const analyzeSecurityCommand = vscode.commands.registerCommand('stellarSuite.analyzeSecurity', (args) => {
            return analyzeSecurity(context, args);
        });

        const showNetworkHealthCommand = vscode.commands.registerCommand('stellarSuite.showNetworkHealth', () => {
            return showNetworkHealth();
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
            installCliCommand,
            switchNetworkCommand,
            keysGenerateCommand,
            keysFundCommand,
            keysListCommand,
            generateBindingsCommand,
            runInvokeCommand,
            contractInfoCommand,
            analyzeSecurityCommand,
            showNetworkHealthCommand,
            watcher
        );
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Stellar Kit activation failed: ${errorMsg}`);
    }
}

export function deactivate() {
    disposeNetworkStatusBar();
}