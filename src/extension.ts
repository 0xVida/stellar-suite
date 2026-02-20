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

// UI
import { SidebarViewProvider } from "./ui/sidebarView";
import { SyncStatusProvider } from "./ui/syncStatusProvider";
import { RpcHealthStatusBar } from "./ui/rpcHealthStatusBar";
import { CompilationStatusProvider } from "./ui/compilationStatusProvider";


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

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel('Stellar Suite');
  outputChannel.appendLine('[Extension] Activating Stellar Suite extension...');

  try {
    // ── Services ──────────────────────────────────────────────
    const groupService = new ContractGroupService(context);
    groupService.loadGroups().catch(() => {
      outputChannel.appendLine('[Extension] WARNING: could not load contract groups');
    });
    registerGroupCommands(context, groupService);

    versionTracker = new ContractVersionTracker(context, outputChannel);

    syncService = new WorkspaceStateSyncService(context);
    syncStatusProvider = new SyncStatusProvider(syncService);
    registerSyncCommands(context, syncService);

    metadataService = new ContractMetadataService(vscode.workspace as any, outputChannel);
    metadataService.startWatching();
    metadataService.scanWorkspace()
      .then(result => {
        outputChannel.appendLine(
          `[Extension] Metadata scan: ${result.contracts.length} Cargo.toml(s)` +
          (result.errors.length ? `, ${result.errors.length} error(s)` : '')
        );
      })
      .catch(err => {
        outputChannel.appendLine(
          `[Extension] Metadata scan error: ${err instanceof Error ? err.message : String(err)}`
        );
      });

    // Health monitoring is best-effort; keep the extension usable if it fails.
    try {
      const config = vscode.workspace.getConfiguration('stellarSuite');
      const rpcUrl = config.get<string>('rpcUrl', 'https://soroban-testnet.stellar.org:443');
      healthMonitor = new RpcHealthMonitor(context, { enableLogging: false });
      healthMonitor.addEndpoint(rpcUrl, 0, true);
      healthMonitor.startMonitoring();
      healthStatusBar = new RpcHealthStatusBar(healthMonitor);
      registerHealthCommands(context, healthMonitor);
    } catch (err) {
      outputChannel.appendLine(
        `[Extension] WARNING: health monitor init failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    rpcLogger = new RpcLogger({ context, enableConsoleOutput: true });
    rpcLogger.loadLogs().catch(() => {
      outputChannel.appendLine('[Extension] WARNING: could not load RPC logs');
    });
    registerRpcLoggingCommands(context, rpcLogger);

    // ── Sidebar ──────────────────────────────────────────────
    sidebarProvider = new SidebarViewProvider(context.extensionUri, context);
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(SidebarViewProvider.viewType, sidebarProvider)
    );

    // ── Commands ─────────────────────────────────────────────
    const simulateCommand = vscode.commands.registerCommand(
      "stellarSuite.simulateTransaction",
      () => simulateTransaction(context, sidebarProvider, simulationHistoryService, resourceProfilingService),
    );

    const deployCommand = vscode.commands.registerCommand(
      'stellarSuite.deployContract',
      () => deployContract(context, sidebarProvider),
    );

    const buildCommand = vscode.commands.registerCommand(
      'stellarSuite.buildContract',
      () => buildContract(context, sidebarProvider),
    );

    const configureCliCommand = vscode.commands.registerCommand(
      'stellarSuite.configureCli',
      () => manageCliConfiguration(context),
    );

    const refreshCommand = vscode.commands.registerCommand(
      'stellarSuite.refreshContracts',
      () => sidebarProvider?.refresh(),
    );

    const deployFromSidebarCommand = vscode.commands.registerCommand(
      "stellarSuite.deployFromSidebar",
      () => deployContract(context, sidebarProvider),
    );

    const simulateFromSidebarCommand = vscode.commands.registerCommand(
      "stellarSuite.simulateFromSidebar",
      () => simulateTransaction(context, sidebarProvider, simulationHistoryService, resourceProfilingService),
    );

    const copyContractIdCommand = vscode.commands.registerCommand(
      'stellarSuite.copyContractId',
      async () => {
        const id = await vscode.window.showInputBox({
          title: 'Copy Contract ID',
          prompt: 'Enter the contract ID to copy to clipboard',
        });
        if (!id) { return; }
        await vscode.env.clipboard.writeText(id);
        vscode.window.showInformationMessage('Contract ID copied to clipboard.');
      },
    );

    const showVersionMismatchesCommand = vscode.commands.registerCommand(
      'stellarSuite.showVersionMismatches',
      async () => {
        if (!versionTracker) { return; }
        const mismatches = versionTracker.getMismatches();
        if (!mismatches.length) {
          vscode.window.showInformationMessage('Stellar Suite: No version mismatches detected.');
          return;
        }
        await versionTracker.notifyMismatches();
      },
    );

    //  Batch deploy command 
    const deployBatchCommand = vscode.commands.registerCommand(
      "stellarSuite.deployBatch",
      () => deployBatch(context),
    );

    //Compilation status commands
    const showCompilationStatusCommand = vscode.commands.registerCommand(
      "stellarSuite.showCompilationStatus",
      async () => {
        if (!compilationStatusProvider) {
          vscode.window.showInformationMessage(
            "Stellar Suite: Compilation status monitor not initialized.",
          );
          return;
        }
        await compilationStatusProvider.showCompilationStatus();
      },
    );

    if (syncService) {
      registerSyncCommands(context, syncService);
      outputChannel.appendLine(
        "[Extension] Workspace sync commands registered",
      );
    }

    // Register simulation history commands
    if (simulationHistoryService) {
      registerSimulationHistoryCommands(context, simulationHistoryService);
      outputChannel.appendLine(
        "[Extension] Simulation history commands registered",
      );
    }

    // Register backup commands
    if (backupService) {
      registerBackupCommands(context, backupService);
      outputChannel.appendLine(
        "[Extension] Backup commands registered",
      );
    }

    if (simulationHistoryService) {
      replayService = new SimulationReplayService(
        simulationHistoryService,
        outputChannel,
      );
      registerReplayCommands(
        context,
        simulationHistoryService,
        replayService,
        sidebarProvider,
      );
      outputChannel.appendLine(
        "[Extension] Simulation replay service initialized and commands registered",
      );
    }

    resourceProfilingService = new ResourceProfilingService(
      context,
      outputChannel,
    );
    registerResourceProfilingCommands(context, resourceProfilingService);
    outputChannel.appendLine(
      "[Extension] Resource profiling service initialized and commands registered",
    );

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
      healthStatusBar ?? new vscode.Disposable(() => {}),
      healthMonitor ?? new vscode.Disposable(() => {}),
    );

    outputChannel.appendLine('[Extension] Extension activation complete');
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
  healthMonitor?.dispose();
  healthStatusBar?.dispose();
  syncStatusProvider?.dispose();
  compilationStatusProvider?.dispose();
  compilationMonitor?.dispose();
}

