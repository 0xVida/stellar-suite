// ============================================================
// src/extension.ts
// Extension entry point — activates commands, sidebar, and watchers.
// ============================================================

import * as vscode from "vscode";
import { simulateTransaction } from "./commands/simulateTransaction";
import { deployContract } from "./commands/deployContract";
import { buildContract } from "./commands/buildContract";
import { registerGroupCommands } from "./commands/groupCommands";
import { SidebarViewProvider } from "./ui/sidebarView";
import { ContractGroupService } from "./services/contractGroupService";
import { ContractVersionTracker } from "./services/contractVersionTracker";
import { ContractMetadataService } from "./services/contractMetadataService";
import { manageCliConfiguration } from "./commands/manageCliConfiguration";
import { registerSyncCommands } from "./commands/syncCommands";
import { WorkspaceStateSyncService } from "./services/workspaceStateSyncService";
import { SyncStatusProvider } from "./ui/syncStatusProvider";
import { WorkspaceStateEncryptionService } from "./services/workspaceStateEncryptionService";
import { RpcHealthMonitor } from "./services/rpcHealthMonitor";
import { RpcHealthStatusBar } from "./ui/rpcHealthStatusBar";
import { registerHealthCommands } from "./commands/healthCommands";
import { SimulationHistoryService } from "./services/simulationHistoryService";
import { registerSimulationHistoryCommands } from "./commands/simulationHistoryCommands";
import { CompilationStatusMonitor } from "./services/compilationStatusMonitor";
import { CompilationStatusProvider } from "./ui/compilationStatusProvider";
import { StateBackupService } from './services/stateBackupService';
import { registerBackupCommands } from './commands/backupCommands';
import { SimulationReplayService } from './services/simulationReplayService';
import { registerReplayCommands } from './commands/replayCommands';
import { RpcFallbackService } from './services/rpcFallbackService';
import { RpcRetryService } from './services/rpcRetryService';
import { RetryStatusBarItem } from './ui/retryStatusBar';
import { registerRetryCommands } from './commands/retryCommands';
import { createCliConfigurationService } from './services/cliConfigurationVscode';

let sidebarProvider: SidebarViewProvider | undefined;
let groupService: ContractGroupService | undefined;
let versionTracker: ContractVersionTracker | undefined;
let metadataService: ContractMetadataService | undefined;
let syncService: WorkspaceStateSyncService | undefined;
let syncStatusProvider: SyncStatusProvider | undefined;
let encryptionService: WorkspaceStateEncryptionService | undefined;
let healthMonitor: RpcHealthMonitor | undefined;
let healthStatusBar: RpcHealthStatusBar | undefined;
let simulationHistoryService: SimulationHistoryService | undefined;
let compilationMonitor: CompilationStatusMonitor | undefined;
let compilationStatusProvider: CompilationStatusProvider | undefined;
let backupService: StateBackupService | undefined;
let replayService: SimulationReplayService | undefined;
let fallbackService: RpcFallbackService | undefined;
let retryService: RpcRetryService | undefined;
let retryStatusBar: RetryStatusBarItem | undefined;

export function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel("Stellar Suite");
    outputChannel.appendLine("[Extension] Activating Stellar Suite extension...");

    try {
        // 1. Initialize core services
        simulationHistoryService = new SimulationHistoryService(context, outputChannel);
        outputChannel.appendLine('[Extension] Simulation history service initialized');

        // 2. Initialize Health, Retry and Fallback services
        healthMonitor = new RpcHealthMonitor(context, {
            checkInterval: 30000,
            failureThreshold: 3,
            timeout: 5000,
            maxHistory: 100
        });
        healthStatusBar = new RpcHealthStatusBar(healthMonitor);

        retryService = new RpcRetryService(
            { resetTimeout: 60000, consecutiveFailuresThreshold: 3 },
            { maxAttempts: 3, initialDelayMs: 100, maxDelayMs: 5000 },
            false
        );
        retryStatusBar = new RetryStatusBarItem(retryService, 5000);
        registerRetryCommands(context, retryService);

        fallbackService = new RpcFallbackService(healthMonitor, retryService);

        const configService = createCliConfigurationService(context);
        configService.getResolvedConfiguration().then(resolved => {
            if (fallbackService) {
                fallbackService.updateEndpoints(resolved.configuration.rpcEndpoints || []);
            }
            if (healthMonitor) {
                healthMonitor.setEndpoints((resolved.configuration.rpcEndpoints || []).map(ep => ({
                    url: ep.url,
                    priority: ep.priority,
                    fallback: false
                })));
            }
        });

        // Listen for configuration changes
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('stellarSuite')) {
                    configService.getResolvedConfiguration().then(resolved => {
                        if (fallbackService) {
                            fallbackService.updateEndpoints(resolved.configuration.rpcEndpoints || []);
                        }
                        if (healthMonitor) {
                            healthMonitor.setEndpoints((resolved.configuration.rpcEndpoints || []).map(ep => ({
                                url: ep.url,
                                priority: ep.priority,
                                fallback: false
                            })));
                        }
                    });
                }
            })
        );
        outputChannel.appendLine('[Extension] RPC health, retry and fallback services initialized');

        // 3. Initialize Contract & Group services
        groupService = new ContractGroupService(context);
        groupService.loadGroups().then(() => {
            outputChannel.appendLine("[Extension] Contract group service initialized");
        });

        versionTracker = new ContractVersionTracker(context, outputChannel);

        metadataService = new ContractMetadataService(
            vscode.workspace as any,
            outputChannel
        );
        metadataService.startWatching();
        metadataService.scanWorkspace().catch(err => {
            outputChannel.appendLine(`[Extension] Metadata scan error: ${err}`);
        });

        // 4. Initialize Compilation, Backup and Sync services
        compilationMonitor = new CompilationStatusMonitor(context);
        compilationStatusProvider = new CompilationStatusProvider(compilationMonitor);

        backupService = new StateBackupService(context, outputChannel);

        syncService = new WorkspaceStateSyncService(context);
        syncStatusProvider = new SyncStatusProvider(syncService);

        // 5. Initialize UI
        sidebarProvider = new SidebarViewProvider(context.extensionUri, context);
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(
                SidebarViewProvider.viewType,
                sidebarProvider
            )
        );

        replayService = new SimulationReplayService(simulationHistoryService, outputChannel);

        // 6. Register Commands
        const simulateCommand = vscode.commands.registerCommand(
            "stellarSuite.simulateTransaction",
            () => simulateTransaction(context, sidebarProvider, simulationHistoryService, fallbackService)
        );

        const deployCommand = vscode.commands.registerCommand(
            "stellarSuite.deployContract",
            () => deployContract(context, sidebarProvider)
        );

        const buildCommand = vscode.commands.registerCommand(
            "stellarSuite.buildContract",
            () => buildContract(context, sidebarProvider, compilationMonitor)
        );

        const configureCliCommand = vscode.commands.registerCommand(
            "stellarSuite.configureCli",
            () => manageCliConfiguration(context)
        );

        const refreshCommand = vscode.commands.registerCommand(
            "stellarSuite.refreshContracts",
            () => sidebarProvider?.refresh()
        );

        const copyContractIdCommand = vscode.commands.registerCommand(
            "stellarSuite.copyContractId",
            async () => {
                const id = await vscode.window.showInputBox({
                    title: "Copy Contract ID",
                    prompt: "Enter the contract ID to copy to clipboard",
                });
                if (id) {
                    await vscode.env.clipboard.writeText(id);
                    vscode.window.showInformationMessage("Contract ID copied to clipboard.");
                }
            }
        );

        const showVersionMismatchesCommand = vscode.commands.registerCommand(
            "stellarSuite.showVersionMismatches",
            async () => {
                if (versionTracker) { await versionTracker.notifyMismatches(); }
            }
        );

        const showCompilationStatusCommand = vscode.commands.registerCommand(
            "stellarSuite.showCompilationStatus",
            async () => {
                if (compilationStatusProvider) { await compilationStatusProvider.showCompilationStatus(); }
            }
        );

        // Register sub-services commands
        registerGroupCommands(context, groupService!);
        registerSyncCommands(context, syncService);
        registerSimulationHistoryCommands(context, simulationHistoryService);
        registerBackupCommands(context, backupService);
        registerReplayCommands(context, simulationHistoryService, replayService, sidebarProvider, fallbackService);
        registerHealthCommands(context, healthMonitor);

        // Sidebar actions
        const deployFromSidebarCommand = vscode.commands.registerCommand(
            "stellarSuite.deployFromSidebar",
            (contractId: string) => {
                context.workspaceState.update('selectedContractPath', contractId);
                return deployContract(context, sidebarProvider);
            }
        );

        const simulateFromSidebarCommand = vscode.commands.registerCommand(
            "stellarSuite.simulateFromSidebar",
            (contractId: string) => simulateTransaction(context, sidebarProvider, simulationHistoryService, fallbackService, contractId)
        );

        // 7. File Watchers
        const watcher = vscode.workspace.createFileSystemWatcher("**/{Cargo.toml,*.wasm}");
        const refreshOnChange = () => sidebarProvider?.refresh();
        watcher.onDidChange(refreshOnChange);
        watcher.onDidCreate(refreshOnChange);
        watcher.onDidDelete(refreshOnChange);

        // 8. Subscriptions
        context.subscriptions.push(
            simulateCommand,
            deployCommand,
            buildCommand,
            configureCliCommand,
            refreshCommand,
            copyContractIdCommand,
            showVersionMismatchesCommand,
            showCompilationStatusCommand,
            deployFromSidebarCommand,
            simulateFromSidebarCommand,
            watcher,
            outputChannel,
            healthMonitor,
            healthStatusBar,
            retryStatusBar || { dispose: () => {} },
            retryService,
            fallbackService,
            metadataService || { dispose: () => {} },
            compilationMonitor || { dispose: () => {} },
            compilationStatusProvider || { dispose: () => {} },
            syncStatusProvider || { dispose: () => {} }
        );

        outputChannel.appendLine("[Extension] Extension activation complete");
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`[Extension] ERROR during activation: ${errorMsg}`);
        console.error("[Stellar Suite] Activation error:", error);
        vscode.window.showErrorMessage(`Stellar Suite activation failed: ${errorMsg}`);
    }
}

export function deactivate() {
  healthMonitor?.dispose();
  healthStatusBar?.dispose();
  syncStatusProvider?.dispose();
  compilationStatusProvider?.dispose();
  compilationMonitor?.dispose();
}
