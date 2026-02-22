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
import { registerRetryCommands } from "./commands/retryCommands";
import { registerCliHistoryCommands } from "./commands/cliHistoryCommands";
import { registerSimulationComparisonCommands } from "./commands/simulationComparisonCommands";
import { registerSimulationDiffCommands } from "./commands/simulationDiffCommands";
import { registerResourceProfilingCommands } from "./commands/resourceProfilingCommands";
import { registerRpcAuthCommands } from "./commands/rpcAuthCommands";
import { registerEnvVariableCommands } from "./commands/envVariableCommands";
import { registerRpcLoggingCommands } from "./commands/rpcLoggingCommands";
import { registerDependencyCommands } from "./commands/dependencyCommands";
import { exportSimulationHistory } from "./commands/exportCommands";
import { registerOfflineSimulationCommands } from "./commands/offlineSimulationCommands";
import { registerAbiCommands } from "./commands/abiCommands";

// Services
import { ContractGroupService } from "./services/contractGroupService";
import { ContractMetadataService } from "./services/contractMetadataService";
import { ContractVersionTracker } from "./services/contractVersionTracker";
import { WorkspaceStateSyncService } from "./services/workspaceStateSyncService";
import { RpcHealthMonitor } from "./services/rpcHealthMonitor";
import { RpcLogger } from "./services/rpcLogger";
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
import { createToastNotificationService } from "./services/toastNotificationVscode";
import { ToastNotificationService } from "./services/toastNotificationService";
import { NotificationPreferencesService } from "./services/notificationPreferencesService";
import { RpcRetryService } from "./services/rpcRetryService";
import { createCliConfigurationService } from "./services/cliConfigurationVscode";
import { createCliVersionService } from "./services/cliVersionVscode";
import { CliVersionService } from "./services/cliVersionService";
import { ContractDependencyDetectionService } from "./services/contractDependencyDetectionService";
import { ContractDependencyWatcherService } from "./services/contractDependencyWatcherService";
import { CliHistoryService } from "./services/cliHistoryService";
import { CliReplayService } from "./services/cliReplayService";
import { StateMigrationService } from "./services/stateMigrationService";
import { migrations } from "./migrations";
import { ContractWorkspaceStateService } from "./services/contractWorkStateService";
import { ContractCacheService } from "./services/contractCacheService";
import { OfflineModeDetectionService } from "./services/offlineModeDetectionService";
import { OfflineSimulationService } from "./services/offlineSimulationService";
import { ContractAbiService } from "./services/contractAbiService";
import { SignatureCacheService } from "./services/signatureCacheService";
import { SourceInspectorService } from "./services/sourceInspectorService";
import { parseRustSource } from "./utils/rustSourceParser";

// UI
import { SidebarViewProvider } from "./ui/sidebarView";
import { SyncStatusProvider } from "./ui/syncStatusProvider";
import { registerSimulationCacheCommands } from "./commands/simulationCacheCommands";
import { RpcHealthStatusBar } from "./ui/rpcHealthStatusBar";
import { CompilationStatusProvider } from "./ui/compilationStatusProvider";
import { RetryStatusBarItem } from "./ui/retryStatusBar";
import { ToastNotificationPanel } from "./ui/toastNotificationPanel";
import { showNotificationPreferences } from "./ui/notificationPreferencesUI";

// Global service instances
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
let simulationReplayService: SimulationReplayService | undefined;
let retryService: RpcRetryService | undefined;
let retryStatusBar: RetryStatusBarItem | undefined;
let cliHistoryService: CliHistoryService | undefined;
let cliReplayService: CliReplayService | undefined;
let resourceProfilingService: ResourceProfilingService | undefined;
let rpcAuthService: RpcAuthService | undefined;
let envVariableService: EnvVariableService | undefined;
let fallbackService: RpcFallbackService | undefined;
let cacheService: ContractCacheService | undefined;
let offlineModeDetectionService: OfflineModeDetectionService | undefined;
let offlineSimulationService: OfflineSimulationService | undefined;
let cliVersionService: CliVersionService | undefined;
// FIX: Removed duplicate declarations of retryService and retryStatusBar
let dependencyDetectionService: ContractDependencyDetectionService | undefined;
let dependencyWatcherService: ContractDependencyWatcherService | undefined;
let contractWorkspaceStateService: ContractWorkspaceStateService | undefined;
let toastNotificationService: ToastNotificationService | undefined;
let toastNotificationPanel: ToastNotificationPanel | undefined;
let notificationPreferencesService: NotificationPreferencesService | undefined;
let contractAbiService: ContractAbiService | undefined;
let signatureCacheService: SignatureCacheService | undefined;
let sourceInspectorService: SourceInspectorService | undefined;

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel("Stellar Suite");
  outputChannel.appendLine("[Extension] Activating Stellar Suite extension...");
  console.log("[Stellar Suite] Extension activating...");
  registerSimulationCacheCommands(context);

  try {
    // 0. Run state migrations
    const migrationService = new StateMigrationService(
      context.workspaceState,
      outputChannel,
    );
    migrationService.registerMigrations(migrations);
    migrationService.runMigrations().then((success) => {
      if (!success) {
        outputChannel.appendLine(
          "[Extension] WARNING: State migration failed. Some data might be inconsistent.",
        );
      }
    });

    contractWorkspaceStateService = new ContractWorkspaceStateService(
      context,
      outputChannel,
    );
    contractWorkspaceStateService
      .initialize()
      .then(async () => {
        await contractWorkspaceStateService?.migrateLegacyState();
        outputChannel.appendLine(
          "[Extension] Contract workspace state initialized",
        );
      })
      .catch((err) => {
        outputChannel.appendLine(
          `[Extension] Contract workspace state init failed: ${String(err)}`,
        );
      });

    // 1. Initialize core services
    simulationHistoryService = new SimulationHistoryService(
      context,
      outputChannel,
    );
    outputChannel.appendLine(
      "[Extension] Simulation history service initialized",
    );

    // 1a. Initialize offline simulation services
    cacheService = new ContractCacheService(context, outputChannel);
    offlineModeDetectionService = new OfflineModeDetectionService(
      context,
      outputChannel,
    );
    offlineSimulationService = new OfflineSimulationService(
      cacheService,
      offlineModeDetectionService,
      simulationHistoryService,
      outputChannel,
    );
    outputChannel.appendLine(
      "[Extension] Offline simulation services initialized",
    );
    // 2. Initialize Health, Retry and Fallback services
    healthMonitor = new RpcHealthMonitor(context, {
      checkInterval: 30000,
      failureThreshold: 3,
      timeout: 5000,
      maxHistory: 100,
    });
    healthStatusBar = new RpcHealthStatusBar(healthMonitor);

    retryService = new RpcRetryService(
      { resetTimeout: 60000, consecutiveFailuresThreshold: 3 },
      { maxAttempts: 3, initialDelayMs: 100, maxDelayMs: 5000 },
      false,
    );
    retryStatusBar = new RetryStatusBarItem(retryService, 5000);
    registerRetryCommands(context, retryService!);

    const copyContractIdCommand = vscode.commands.registerCommand(
      "stellarSuite.copyContractId",
      () => {
        vscode.window.showInformationMessage(
          "Contract ID copied to clipboard.",
        );
      },
    );

    // 9. Initialize Notification Preferences and Toast Notification System
    notificationPreferencesService = new NotificationPreferencesService(
      context.workspaceState,
    );
    toastNotificationService = createToastNotificationService(
      context,
      notificationPreferencesService,
    );
    toastNotificationPanel = new ToastNotificationPanel(
      toastNotificationService,
    );

    const showNotificationHistoryCommand = vscode.commands.registerCommand(
      "stellarSuite.showNotificationHistory",
      () => toastNotificationPanel?.showNotificationHistory(),
    );

    const openNotificationPreferencesCommand = vscode.commands.registerCommand(
      "stellarSuite.openNotificationPreferences",
      () =>
        notificationPreferencesService &&
        showNotificationPreferences(notificationPreferencesService),
    );

    // CLI Version Detection
    cliVersionService = createCliVersionService(context, outputChannel);
    context.subscriptions.push(cliVersionService);
    outputChannel.appendLine("[Extension] CLI version detection initialized");

    context.subscriptions.push(
      showNotificationHistoryCommand,
      openNotificationPreferencesCommand,
    );
    outputChannel.appendLine(
      "[Extension] Toast notification system initialized",
    );

    // Initialize compilation status monitoring
    compilationMonitor = new CompilationStatusMonitor(context);
    compilationStatusProvider = new CompilationStatusProvider(
      compilationMonitor,
    );
    outputChannel.appendLine(
      "[Extension] Compilation status monitoring initialized",
    );

    // Initialize CLI history and replay services
    cliHistoryService = new CliHistoryService(context);
    cliReplayService = new CliReplayService(cliHistoryService);

    // Initialize and register sidebar
    sidebarProvider = new SidebarViewProvider(
      context.extensionUri,
      context,
      cliHistoryService,
      cliReplayService,
    );
    sidebarProvider.setStatusServices(compilationMonitor, healthMonitor);

    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        SidebarViewProvider.viewType,
        sidebarProvider,
      ),
    );
    outputChannel.appendLine("[Extension] Sidebar view provider registered");

    outputChannel.appendLine("[Extension] All services initialized");

    // Wire CLI version warnings to sidebar
    if (cliVersionService && sidebarProvider) {
      cliVersionService.onWarning((result) => {
        sidebarProvider?.postCliVersionWarning(result);
      });
    }
    // 10. Register Commands
    const simulateCommand = vscode.commands.registerCommand(
      "stellarSuite.simulateTransaction",
      () => simulateTransaction(context, sidebarProvider),
    );

    const deployCommand = vscode.commands.registerCommand(
      "stellarSuite.deployContract",
      () => deployContract(context, sidebarProvider),
    );

    const buildCommand = vscode.commands.registerCommand(
      "stellarSuite.buildContract",
      () => buildContract(context),
    );

    const configureCliCommand = vscode.commands.registerCommand(
      "stellarSuite.manageCliConfiguration",
      () => manageCliConfiguration(context),
    );

    const deployBatchCommand = vscode.commands.registerCommand(
      "stellarSuite.deployBatch",
      () => deployBatch(context),
    );

    const exportHistoryCommand = vscode.commands.registerCommand(
      "stellarSuite.exportSimulationHistory",
      () => exportSimulationHistory(context),
    );

    const showVersionMismatchesCommand = vscode.commands.registerCommand(
      "stellarSuite.showVersionMismatches",
      async () => {
        if (versionTracker) {
          await versionTracker.notifyMismatches();
        }
      },
    );

    const showCompilationStatusCommand = vscode.commands.registerCommand(
      "stellarSuite.showCompilationStatus",
      async () => {
        if (compilationStatusProvider) {
          await compilationStatusProvider.showCompilationStatus();
        }
      },
    );

    const exportContractStateCommand = vscode.commands.registerCommand(
      "stellarSuite.exportContractWorkspaceState",
      async () => {
        if (!contractWorkspaceStateService) {
          vscode.window.showErrorMessage(
            "Contract workspace state service is not initialized.",
          );
          return;
        }

        const uri = await vscode.window.showSaveDialog({
          filters: { JSON: ["json"] },
          defaultUri: vscode.Uri.file(
            `stellar-suite-contract-state-${Date.now()}.json`,
          ),
        });
        if (!uri) {
          return;
        }

        const payload = contractWorkspaceStateService.exportState();
        await vscode.workspace.fs.writeFile(uri, Buffer.from(payload, "utf8"));
        vscode.window.showInformationMessage(
          "Contract workspace state exported successfully.",
        );
      },
    );

    const importContractStateCommand = vscode.commands.registerCommand(
      "stellarSuite.importContractWorkspaceState",
      async () => {
        if (!contractWorkspaceStateService) {
          vscode.window.showErrorMessage(
            "Contract workspace state service is not initialized.",
          );
          return;
        }

        const files = await vscode.window.showOpenDialog({
          canSelectMany: false,
          canSelectFiles: true,
          filters: { JSON: ["json"] },
        });
        if (!files || files.length === 0) {
          return;
        }

        const mode = await vscode.window.showQuickPick(
          [
            { label: "Merge with existing state", value: "merge" as const },
            { label: "Replace existing state", value: "replace" as const },
          ],
          { placeHolder: "How should imported contract state be applied?" },
        );

        if (!mode) {
          return;
        }

        const bytes = await vscode.workspace.fs.readFile(files[0]);
        await contractWorkspaceStateService.importState(
          Buffer.from(bytes).toString("utf8"),
          mode.value,
        );
        vscode.window.showInformationMessage(
          "Contract workspace state imported successfully.",
        );
      },
    );

    const checkCliVersionCommand = vscode.commands.registerCommand(
      "stellarSuite.checkCliVersion",
      async () => {
        if (!cliVersionService) {
          return;
        }
        const cliPath = vscode.workspace
          .getConfiguration("stellarSuite")
          .get<string>("cliPath", "stellar");
        cliVersionService.clearCache();
        const result = await cliVersionService.checkVersion(cliPath);
        if (result) {
          if (result.compatible) {
            vscode.window.showInformationMessage(result.message);
          } else {
            const action = result.upgradeCommand
              ? await vscode.window.showWarningMessage(
                result.message,
                "Copy Upgrade Command",
              )
              : undefined;
            if (action === "Copy Upgrade Command" && result.upgradeCommand) {
              await vscode.env.clipboard.writeText(result.upgradeCommand);
              vscode.window.showInformationMessage(
                "Upgrade command copied to clipboard.",
              );
            }
          }
        } else {
          vscode.window.showInformationMessage(
            "CLI version check is disabled.",
          );
        }
      },
    );

    registerSimulationHistoryCommands(context, simulationHistoryService!);
    // FIX: Use simulationReplayService (was incorrectly replayService in the old broken copy)
    registerReplayCommands(
      context,
      simulationHistoryService!,
      simulationReplayService!,
      sidebarProvider,
      fallbackService,
    );
    registerSimulationComparisonCommands(context, simulationHistoryService!);
    registerSimulationDiffCommands(context, simulationHistoryService!);
    registerOfflineSimulationCommands(
      context,
      offlineSimulationService!,
      cacheService!,
      offlineModeDetectionService!,
      sidebarProvider,
    );
    registerHealthCommands(context, healthMonitor!);

    // Initialize ABI service and register commands
    contractAbiService = new ContractAbiService(context, outputChannel);
    registerAbiCommands(context, contractAbiService, outputChannel);
    outputChannel.appendLine("[Extension] Contract ABI service initialized");

    // Initialize source inspector service
    signatureCacheService = new SignatureCacheService(context, outputChannel);
    const vscodeFileSystem = {
      readFile: async (filePath: string) => {
        const uri = vscode.Uri.file(filePath);
        const bytes = await vscode.workspace.fs.readFile(uri);
        return Buffer.from(bytes).toString("utf-8");
      },
      findFiles: async (dirPath: string, pattern: string) => {
        const globPattern = new vscode.RelativePattern(dirPath, `**/${pattern}`);
        const uris = await vscode.workspace.findFiles(globPattern);
        return uris.map((u) => u.fsPath);
      },
    };
    sourceInspectorService = new SourceInspectorService(
      signatureCacheService,
      vscodeFileSystem,
      outputChannel,
    );

    const parseContractSourceCommand = vscode.commands.registerCommand(
      "stellarSuite.parseContractSource",
      async () => {
        const uris = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: { "Rust files": ["rs"] },
          openLabel: "Parse Contract Source",
        });
        if (!uris || uris.length === 0) {
          return;
        }
        try {
          const bytes = await vscode.workspace.fs.readFile(uris[0]);
          const content = Buffer.from(bytes).toString("utf-8");
          const parsed = parseRustSource(content, uris[0].fsPath);
          const pubFns = parsed.functions.filter(
            (f) => f.isContractImpl && f.visibility === "pub",
          );

          outputChannel.clear();
          outputChannel.appendLine(
            `Contract: ${parsed.contractName ?? "(unnamed)"}`,
          );
          outputChannel.appendLine(
            `Public contract functions: ${pubFns.length}`,
          );
          outputChannel.appendLine("─".repeat(50));
          for (const fn of pubFns) {
            const params = fn.parameters
              .map(
                (p) =>
                  `${p.name}: ${p.isReference ? "&" : ""}${p.isMutable ? "mut " : ""}${p.typeStr}`,
              )
              .join(", ");
            const retStr = fn.returnType ? ` -> ${fn.returnType}` : "";
            outputChannel.appendLine(`  pub fn ${fn.name}(${params})${retStr}`);
            if (fn.docComments.length > 0) {
              outputChannel.appendLine(
                `    ↳ ${fn.docComments[0]}`,
              );
            }
          }
          outputChannel.show(true);
          vscode.window.showInformationMessage(
            `Parsed ${pubFns.length} public contract function(s) from ${parsed.contractName ?? "source"}.`,
          );
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(
            `Failed to parse contract source: ${msg}`,
          );
        }
      },
    );
    context.subscriptions.push(parseContractSourceCommand);
    outputChannel.appendLine(
      "[Extension] Source inspector service initialized",
    );

    // Sidebar actions
    const deployFromSidebarCommand = vscode.commands.registerCommand(
      "stellarSuite.deployFromSidebar",
      (contractId: string) => {
        if (typeof contractId === "string") {
          context.workspaceState.update("selectedContractPath", contractId);
        }
        return deployContract(context, sidebarProvider);
      },
    );

    const refreshCommand = vscode.commands.registerCommand(
      "stellarSuite.refresh",
      async () => {
        sidebarProvider?.refresh();
      },
    );

    // 11. File Watchers (simulateFromSidebar)
    const simulateFromSidebarCommand = vscode.commands.registerCommand(
      "stellarSuite.simulateFromSidebar",
      (contractId: string) => {
        if (typeof contractId === "string") {
          context.workspaceState.update("selectedContractPath", contractId);
        }
        return simulateTransaction(context, sidebarProvider);
      },
    );
    // 11. File Watchers
    const watcher = vscode.workspace.createFileSystemWatcher(
      "**/{Cargo.toml,*.wasm}",
    );
    const refreshOnChange = () => sidebarProvider?.refresh();
    watcher.onDidChange(refreshOnChange);
    watcher.onDidCreate(refreshOnChange);
    watcher.onDidDelete(refreshOnChange);

    // 12. Subscriptions
    context.subscriptions.push(
      simulateCommand,
      deployCommand,
      buildCommand,
      configureCliCommand,
      refreshCommand,
      deployBatchCommand,
      exportHistoryCommand,
      copyContractIdCommand,
      showVersionMismatchesCommand,
      showCompilationStatusCommand,
      checkCliVersionCommand,
      exportContractStateCommand,
      importContractStateCommand,
      deployFromSidebarCommand,
      simulateFromSidebarCommand,
      watcher,
      outputChannel,
      healthMonitor!,
      healthStatusBar!,
      retryStatusBar || { dispose: () => { } },
      retryService!,
      fallbackService!,
      { dispose: () => metadataService?.dispose() },
      compilationMonitor || { dispose: () => { } },
      compilationStatusProvider || { dispose: () => { } },
      syncStatusProvider || { dispose: () => { } },
      toastNotificationService || { dispose: () => { } },
      toastNotificationPanel || { dispose: () => { } },
    );

    outputChannel.appendLine("[Extension] Extension activation complete");
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    outputChannel.appendLine(
      `[Extension] ERROR during activation: ${errorMsg}`,
    );
    if (error instanceof Error && error.stack) {
      outputChannel.appendLine(`[Extension] Stack: ${error.stack}`);
    }
    console.error("[Stellar Suite] Activation error:", error);
    vscode.window.showErrorMessage(
      `Stellar Suite activation failed: ${errorMsg}`,
    );
  }
}

export function deactivate() {
  sidebarProvider?.dispose();
  dependencyWatcherService?.dispose();
  healthMonitor?.dispose();
  healthStatusBar?.dispose();
  syncStatusProvider?.dispose();
  compilationStatusProvider?.dispose();
  compilationMonitor?.dispose();
  metadataService?.dispose();
  toastNotificationService?.dispose();
  toastNotificationPanel?.dispose();
}
