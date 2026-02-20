import * as vscode from "vscode";

// Commands
import { buildContract } from "./commands/buildContract";
import { deployContract } from "./commands/deployContract";
import { deployBatch } from "./commands/deployBatch";
import { simulateTransaction } from "./commands/simulateTransaction";
import { manageCliConfiguration } from "./commands/manageCliConfiguration";
import { registerGroupCommands } from "./commands/groupCommands";
import { registerHealthCommands } from "./commands/healthCommands";
import { registerSyncCommands } from "./commands/syncCommands";
import { registerSimulationHistoryCommands } from "./commands/simulationHistoryCommands";
import { registerBackupCommands } from "./commands/backupCommands";
import { registerReplayCommands } from "./commands/replayCommands";
import { registerResourceProfilingCommands } from "./commands/resourceProfilingCommands";
import { registerRpcAuthCommands } from "./commands/rpcAuthCommands";
import { registerEnvVariableCommands } from "./commands/envVariableCommands";
import { registerRetryCommands } from "./commands/retryCommands";
import { registerRpcLoggingCommands } from "./commands/rpcLoggingCommands";

// Services
import { ContractGroupService } from "./services/contractGroupService";
import { ContractMetadataService } from "./services/contractMetadataService";
import { ContractVersionTracker } from "./services/contractVersionTracker";
import { WorkspaceStateSyncService } from "./services/workspaceStateSyncService";
import { WorkspaceStateEncryptionService } from "./services/workspaceStateEncryptionService";
import { RpcHealthMonitor } from "./services/rpcHealthMonitor";
import { SimulationHistoryService } from "./services/simulationHistoryService";
import { CompilationStatusMonitor } from "./services/compilationStatusMonitor";
import { StateBackupService } from "./services/stateBackupService";
import { SimulationReplayService } from "./services/simulationReplayService";
import { ResourceProfilingService } from "./services/resourceProfilingService";
import { createRpcAuthService } from "./services/rpcAuthVscode";
import { RpcAuthService } from "./services/rpcAuthService";
import { createEnvVariableService } from "./services/envVariableVscode";
import { EnvVariableService } from "./services/envVariableService";
import { RpcFallbackService } from "./services/rpcFallbackService";
import { RpcRetryService } from "./services/rpcRetryService";
import { RpcLogger } from "./services/rpcLogger";
import { createCliConfigurationService } from "./services/cliConfigurationVscode";

// UI
import { SidebarViewProvider } from "./ui/sidebarView";
import { SyncStatusProvider } from "./ui/syncStatusProvider";
import { RpcHealthStatusBar } from "./ui/rpcHealthStatusBar";
import { CompilationStatusProvider } from "./ui/compilationStatusProvider";
import { RetryStatusBarItem } from "./ui/retryStatusBar";

let sidebarProvider: SidebarViewProvider | undefined;
let metadataService: ContractMetadataService | undefined;
let versionTracker: ContractVersionTracker | undefined;
let syncService: WorkspaceStateSyncService | undefined;
let syncStatusProvider: SyncStatusProvider | undefined;

let healthMonitor: RpcHealthMonitor | undefined;
let healthStatusBar: RpcHealthStatusBar | undefined;

let rpcLogger: RpcLogger | undefined;
let simulationHistoryService: SimulationHistoryService | undefined;
let compilationMonitor: CompilationStatusMonitor | undefined;
let compilationStatusProvider: CompilationStatusProvider | undefined;
let backupService: StateBackupService | undefined;
let replayService: SimulationReplayService | undefined;
let resourceProfilingService: ResourceProfilingService | undefined;
let rpcAuthService: RpcAuthService | undefined;
let envVariableService: EnvVariableService | undefined;
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
        registerRetryCommands(context, retryService!);

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
        const groupService = new ContractGroupService(context);
        groupService.loadGroups().catch(() => {
            outputChannel.appendLine('[Extension] WARNING: could not load contract groups');
        });
        registerGroupCommands(context, groupService);

        versionTracker = new ContractVersionTracker(context, outputChannel);

        metadataService = new ContractMetadataService(
            vscode.workspace as any,
            outputChannel
        );
        metadataService.startWatching();
        metadataService.scanWorkspace().then(result => {
            outputChannel.appendLine(
                `[Extension] Metadata scan: ${result.contracts.length} Cargo.toml(s)` +
                (result.errors.length ? `, ${result.errors.length} error(s)` : '')
            );
        }).catch(err => {
            outputChannel.appendLine(`[Extension] Metadata scan error: ${err}`);
        });

        // 4. Initialize Resource Profiling and Env Variable services
        resourceProfilingService = new ResourceProfilingService(context, outputChannel);
        registerResourceProfilingCommands(context, resourceProfilingService);

        envVariableService = createEnvVariableService(context);
        registerEnvVariableCommands(context, envVariableService);

        rpcLogger = new RpcLogger({ context, enableConsoleOutput: true });
        rpcLogger.loadLogs().catch(() => {
            outputChannel.appendLine('[Extension] WARNING: could not load RPC logs');
        });
        registerRpcLoggingCommands(context, rpcLogger);

        // 5. Initialize Compilation, Backup and Sync services
        compilationMonitor = new CompilationStatusMonitor(context);
        compilationStatusProvider = new CompilationStatusProvider(compilationMonitor);

        backupService = new StateBackupService(context, outputChannel);
        registerBackupCommands(context, backupService);

        syncService = new WorkspaceStateSyncService(context);
        syncStatusProvider = new SyncStatusProvider(syncService);
        registerSyncCommands(context, syncService);

        // 6. Initialize UI
        sidebarProvider = new SidebarViewProvider(context.extensionUri, context);
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(
                SidebarViewProvider.viewType,
                sidebarProvider
            )
        );

        replayService = new SimulationReplayService(simulationHistoryService!, outputChannel);

    resourceProfilingService = new ResourceProfilingService(
      context,
      outputChannel,
    );
    registerResourceProfilingCommands(context, resourceProfilingService);
    outputChannel.appendLine(
      "[Extension] Resource profiling service initialized and commands registered",
    );

    // ── RPC Authentication ──────────────────────────────────
    rpcAuthService = createRpcAuthService(context);
    const updateRpcAuthHeaders = async () => {
      if (!rpcAuthService || !rpcService) return;
      const headers = await rpcAuthService.getAuthHeaders();
      rpcService.setAuthHeaders(headers);
    };
    // Initialize headers on startup
    updateRpcAuthHeaders().catch(err => {
      outputChannel.appendLine(`[Error] Failed to initialize RPC Auth: ${err}`);
    });
    registerRpcAuthCommands(context, rpcAuthService, updateRpcAuthHeaders);
    outputChannel.appendLine("[Extension] RPC Auth service initialized and commands registered");

    outputChannel.appendLine("[Extension] All commands registered");


    // ── Watchers ─────────────────────────────────────────────
    const watcher = vscode.workspace.createFileSystemWatcher('**/{Cargo.toml,*.wasm}');
    const refreshOnChange = () => sidebarProvider?.refresh();
    watcher.onDidChange(refreshOnChange);
    watcher.onDidCreate(refreshOnChange);
    watcher.onDidDelete(refreshOnChange);

    context.subscriptions.push(
      simulateCommand,
      deployCommand,
      buildCommand,
      configureCliCommand,
      refreshCommand,
      deployFromSidebarCommand,
      simulateFromSidebarCommand,
      copyContractIdCommand,
      showVersionMismatchesCommand,
      showCompilationStatusCommand,
      watcher,
      { dispose: () => metadataService?.dispose() },
      syncStatusProvider,
      healthStatusBar ?? new vscode.Disposable(() => { }),
      healthMonitor ?? new vscode.Disposable(() => { }),
    );

    outputChannel.appendLine('[Extension] Extension activation complete');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    outputChannel.appendLine(`[Extension] ERROR during activation: ${errorMsg}`);
    if (error instanceof Error && error.stack) {
      outputChannel.appendLine(`[Extension] Stack: ${error.stack}`);
    }
        // 7. Register Commands
        const simulateCommand = vscode.commands.registerCommand(
            "stellarSuite.simulateTransaction",
            () => simulateTransaction(context, sidebarProvider, simulationHistoryService, fallbackService, resourceProfilingService)
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

        const deployBatchCommand = vscode.commands.registerCommand(
            "stellarSuite.deployBatch",
            () => deployBatch(context)
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

        registerSimulationHistoryCommands(context, simulationHistoryService!);
        registerReplayCommands(context, simulationHistoryService!, replayService, sidebarProvider, fallbackService);
        registerHealthCommands(context, healthMonitor!);

        // Sidebar actions
        const deployFromSidebarCommand = vscode.commands.registerCommand(
            "stellarSuite.deployFromSidebar",
            (contractId: string) => {
                if (typeof contractId === 'string') {
                    context.workspaceState.update('selectedContractPath', contractId);
                }
                return deployContract(context, sidebarProvider);
            }
        );

        const simulateFromSidebarCommand = vscode.commands.registerCommand(
            "stellarSuite.simulateFromSidebar",
            (contractId: string) => simulateTransaction(context, sidebarProvider, simulationHistoryService, fallbackService, resourceProfilingService, contractId)
        );

        // 8. File Watchers
        const watcher = vscode.workspace.createFileSystemWatcher("**/{Cargo.toml,*.wasm}");
        const refreshOnChange = () => sidebarProvider?.refresh();
        watcher.onDidChange(refreshOnChange);
        watcher.onDidCreate(refreshOnChange);
        watcher.onDidDelete(refreshOnChange);

        // 9. Subscriptions
        context.subscriptions.push(
            simulateCommand,
            deployCommand,
            buildCommand,
            configureCliCommand,
            refreshCommand,
            deployBatchCommand,
            copyContractIdCommand,
            showVersionMismatchesCommand,
            showCompilationStatusCommand,
            deployFromSidebarCommand,
            simulateFromSidebarCommand,
            watcher,
            outputChannel,
            healthMonitor!,
            healthStatusBar!,
            retryStatusBar || { dispose: () => {} },
            retryService!,
            fallbackService!,
            { dispose: () => metadataService?.dispose() },
            compilationMonitor || { dispose: () => {} },
            compilationStatusProvider || { dispose: () => {} },
            syncStatusProvider || { dispose: () => {} }
        );

        outputChannel.appendLine("[Extension] Extension activation complete");
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`[Extension] ERROR during activation: ${errorMsg}`);
        if (error instanceof Error && error.stack) {
            outputChannel.appendLine(`[Extension] Stack: ${error.stack}`);
        }
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
