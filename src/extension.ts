// ============================================================
// src/extension.ts
// Extension entry point — activates commands, sidebar, watchers.
// ============================================================

import * as vscode from 'vscode';

import { buildContract } from './commands/buildContract';
import { deployContract } from './commands/deployContract';
import { registerGroupCommands } from './commands/groupCommands';
import { registerHealthCommands } from './commands/healthCommands';
import { manageCliConfiguration } from './commands/manageCliConfiguration';
import { registerRpcLoggingCommands } from './commands/rpcLoggingCommands';
import { simulateTransaction } from './commands/simulateTransaction';
import { registerSyncCommands } from './commands/syncCommands';

import { ContractGroupService } from './services/contractGroupService';
import { ContractMetadataService } from './services/contractMetadataService';
import { ContractVersionTracker } from './services/contractVersionTracker';
import { RpcHealthMonitor } from './services/rpcHealthMonitor';
import { RpcLogger } from './services/rpcLogger';
import { WorkspaceStateSyncService } from './services/workspaceStateSyncService';

import { RpcHealthStatusBar } from './ui/rpcHealthStatusBar';
import { SidebarViewProvider } from './ui/sidebarView';
import { SyncStatusProvider } from './ui/syncStatusProvider';

import { deployBatch } from './commands/deployBatch';

let sidebarProvider: SidebarViewProvider | undefined;
let metadataService: ContractMetadataService | undefined;
let versionTracker: ContractVersionTracker | undefined;
let syncService: WorkspaceStateSyncService | undefined;
let syncStatusProvider: SyncStatusProvider | undefined;

let healthMonitor: RpcHealthMonitor | undefined;
let healthStatusBar: RpcHealthStatusBar | undefined;

let rpcLogger: RpcLogger | undefined;

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel('Stellar Suite');
  outputChannel.appendLine('[Extension] Activating Stellar Suite extension...');

        // Register group commands
        registerGroupCommands(context, groupService);
        outputChannel.appendLine('[Extension] Group commands registered');

        // Initialize version tracker
        versionTracker = new ContractVersionTracker(context, outputChannel);
        outputChannel.appendLine('[Extension] Contract version tracker initialized');

        // Initialize RPC retry service with circuit breaker
        retryService = new RpcRetryService(
            { resetTimeout: 60000, consecutiveFailuresThreshold: 3 },
            { maxAttempts: 3, initialDelayMs: 100, maxDelayMs: 5000 },
            false
        );
        retryStatusBar = new RetryStatusBarItem(retryService, 5000);
        registerRetryCommands(context, retryService);
        outputChannel.appendLine('[Extension] RPC retry service with circuit breaker initialized');

        // Initialize workspace state synchronization
        syncService = new WorkspaceStateSyncService(context);
        syncStatusProvider = new SyncStatusProvider(syncService);
        outputChannel.appendLine('[Extension] Workspace state sync service initialized');

        // ── Sidebar ───────────────────────────────────────────
        sidebarProvider = new SidebarViewProvider(context.extensionUri, context);
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(
                SidebarViewProvider.viewType,
                sidebarProvider
            )
        );
        outputChannel.appendLine('[Extension] Sidebar view provider registered');
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
      'stellarSuite.simulateTransaction',
      () => simulateTransaction(context, sidebarProvider),
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
      'stellarSuite.deployFromSidebar',
      () => deployContract(context, sidebarProvider),
    );

    const simulateFromSidebarCommand = vscode.commands.registerCommand(
      'stellarSuite.simulateFromSidebar',
      () => simulateTransaction(context, sidebarProvider),
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

    const deployBatchCommand = vscode.commands.registerCommand(
  'stellarSuite.deployBatch',
  () => deployBatch(context),
);

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

