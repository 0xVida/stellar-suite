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

let sidebarProvider: SidebarViewProvider | undefined;
let groupService: ContractGroupService | undefined;
let versionTracker: ContractVersionTracker | undefined;
let metadataService: ContractMetadataService | undefined;
let syncService: WorkspaceStateSyncService | undefined;
let syncStatusProvider: SyncStatusProvider | undefined;
let encryptionService: WorkspaceStateEncryptionService | undefined;

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel("Stellar Suite");
  outputChannel.appendLine("[Extension] Activating Stellar Suite extension...");
  console.log("[Stellar Suite] Extension activating...");

  try {
    // Initialize contract group service
    groupService = new ContractGroupService(context);
    groupService.loadGroups().then(() => {
      outputChannel.appendLine(
        "[Extension] Contract group service initialized",
      );
    });

    // Register group commands
    registerGroupCommands(context, groupService);
    outputChannel.appendLine("[Extension] Group commands registered");

    // Initialize version tracker
    versionTracker = new ContractVersionTracker(context, outputChannel);
    outputChannel.appendLine(
      "[Extension] Contract version tracker initialized",
    );
    // Initialize workspace state synchronization
    syncService = new WorkspaceStateSyncService(context);
    syncStatusProvider = new SyncStatusProvider(syncService);
    outputChannel.appendLine(
      "[Extension] Workspace state sync service initialized",
    );

    // Initialize contract metadata service
    metadataService = new ContractMetadataService(
      vscode.workspace as any,
      outputChannel,
    );
    metadataService.startWatching();
    outputChannel.appendLine(
      "[Extension] Contract metadata service initialized",
    );

    // Trigger an initial background workspace scan so the cache is warm
    metadataService
      .scanWorkspace()
      .then((result) => {
        outputChannel.appendLine(
          `[Extension] Metadata scan: ${result.contracts.length} Cargo.toml(s) found` +
            (result.errors.length ? `, ${result.errors.length} error(s)` : ""),
        );
      })
      .catch((err) => {
        outputChannel.appendLine(
          `[Extension] Metadata scan error: ${err instanceof Error ? err.message : String(err)}`,
        );
      });

    // ── Sidebar ───────────────────────────────────────────
    sidebarProvider = new SidebarViewProvider(context.extensionUri, context);
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        SidebarViewProvider.viewType,
        sidebarProvider,
      ),
    );
    outputChannel.appendLine("[Extension] Sidebar view provider registered");

    // ── Core commands ─────────────────────────────────────
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
      () => buildContract(context, sidebarProvider),
    );

    const configureCliCommand = vscode.commands.registerCommand(
      "stellarSuite.configureCli",
      () => manageCliConfiguration(context),
    );

    const refreshCommand = vscode.commands.registerCommand(
      "stellarSuite.refreshContracts",
      () => {
        if (sidebarProvider) {
          sidebarProvider.refresh();
        } else {
          outputChannel.appendLine(
            "[Extension] WARNING: sidebarProvider not available",
          );
        }

    // Register health monitoring commands
    if (healthMonitor) {
        registerHealthCommands(context, healthMonitor);
        outputChannel.appendLine('[Extension] RPC health commands registered');
    }

    outputChannel.appendLine('[Extension] All commands registered');
    console.log('[Stellar Suite] All commands registered');
        outputChannel.appendLine('[Extension] All commands registered');

        // ── File watcher ──────────────────────────────────────
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
            watcher,
            syncStatusProvider || { dispose: () => {} },
            encryptionService
        );

        outputChannel.appendLine('[Extension] Extension activation complete');
        console.log('[Stellar Suite] Extension activation complete');

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
        watcher,
        healthStatusBar || { dispose: () => {} },
        healthMonitor || { dispose: () => {} }
    );

    outputChannel.appendLine('[Extension] Extension activation complete');
    console.log('[Stellar Suite] Extension activation complete');
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`[Extension] ERROR during activation: ${errorMsg}`);
        if (error instanceof Error && error.stack) {
            outputChannel.appendLine(`[Extension] Stack: ${error.stack}`);
      },
    );

    const deployFromSidebarCommand = vscode.commands.registerCommand(
      "stellarSuite.deployFromSidebar",
      () => deployContract(context, sidebarProvider),
    );

    const simulateFromSidebarCommand = vscode.commands.registerCommand(
      "stellarSuite.simulateFromSidebar",
      () => simulateTransaction(context, sidebarProvider),
    );

    // ── Context menu commands (callable from Command Palette) ──
    //
    // These mirror the context menu actions so power users can
    // also trigger them via Ctrl+Shift+P.

    const copyContractIdCommand = vscode.commands.registerCommand(
      "stellarSuite.copyContractId",
      async () => {
        const id = await vscode.window.showInputBox({
          title: "Copy Contract ID",
          prompt: "Enter the contract ID to copy to clipboard",
        });
        if (id) {
          await vscode.env.clipboard.writeText(id);
          vscode.window.showInformationMessage(
            "Contract ID copied to clipboard.",
          );
        }
      },
    );

    // ── Version tracking commands ─────────────────────────
    const showVersionMismatchesCommand = vscode.commands.registerCommand(
      "stellarSuite.showVersionMismatches",
      async () => {
        if (!versionTracker) {
          return;
        }
        const mismatches = versionTracker.getMismatches();
        if (!mismatches.length) {
          vscode.window.showInformationMessage(
            "Stellar Suite: No version mismatches detected.",
          );
          return;
        }
        await versionTracker.notifyMismatches();
      },
    );
    // Register sync commands
    if (syncService) {
      registerSyncCommands(context, syncService);
      outputChannel.appendLine(
        "[Extension] Workspace sync commands registered",
      );
    }

    outputChannel.appendLine("[Extension] All commands registered");

    // ── File watcher ──────────────────────────────────────
    const watcher = vscode.workspace.createFileSystemWatcher(
      "**/{Cargo.toml,*.wasm}",
    );
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
      watcher,
      { dispose: () => metadataService?.dispose() },
      syncStatusProvider || { dispose: () => {} },
    );

    outputChannel.appendLine("[Extension] Extension activation complete");
    console.log("[Stellar Suite] Extension activation complete");
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
    healthMonitor?.dispose();
    healthStatusBar?.dispose();
    syncStatusProvider?.dispose();
  syncStatusProvider?.dispose();
}
