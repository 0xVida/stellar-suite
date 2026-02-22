import * as vscode from 'vscode';
import { WorkspaceStateSyncService, ConflictResolutionStrategy, SyncOptions, SyncStatus } from '../services/workspaceStateSyncService';

/**
 * Register all workspace state synchronization commands.
 */
export function registerSyncCommands(context: vscode.ExtensionContext, syncService: WorkspaceStateSyncService): void {
    // Synchronize workspace state
    context.subscriptions.push(
        vscode.commands.registerCommand('stellarSuite.syncWorkspaceState', async () => {
            await syncWorkspaceState(syncService);
        })
    );

    // Synchronize with conflict resolution
    context.subscriptions.push(
        vscode.commands.registerCommand('stellarSuite.syncWithConflictResolution', async () => {
            await syncWithConflictResolution(syncService);
        })
    );

    // Export state for sharing
    context.subscriptions.push(
        vscode.commands.registerCommand('stellarSuite.exportSyncState', async () => {
            await exportSyncState(syncService);
        })
    );

    // Import state from another workspace
    context.subscriptions.push(
        vscode.commands.registerCommand('stellarSuite.importSyncState', async () => {
            await importSyncState(syncService);
        })
    );

    // Selective sync (deployments only)
    context.subscriptions.push(
        vscode.commands.registerCommand('stellarSuite.syncDeploymentsOnly', async () => {
            await syncSelectiveState(syncService, { syncDeployments: true, syncConfigurations: false });
        })
    );

    // Selective sync (configurations only)
    context.subscriptions.push(
        vscode.commands.registerCommand('stellarSuite.syncConfigurationsOnly', async () => {
            await syncSelectiveState(syncService, { syncDeployments: false, syncConfigurations: true });
        })
    );

    // Validate synchronization state
    context.subscriptions.push(
        vscode.commands.registerCommand('stellarSuite.validateSyncState', async () => {
            await validateSyncState(syncService);
        })
    );

    // Clear synchronization state
    context.subscriptions.push(
        vscode.commands.registerCommand('stellarSuite.clearSyncState', async () => {
            await clearSyncState(syncService);
        })
    );

    // Show sync status
    context.subscriptions.push(
        vscode.commands.registerCommand('stellarSuite.showSyncStatus', async () => {
            showSyncStatus(syncService);
        })
    );
}

/**
 * Synchronize workspace state with user-selected strategy.
 */
async function syncWorkspaceState(syncService: WorkspaceStateSyncService): Promise<void> {
    const strategy = await selectConflictStrategy();
    if (!strategy) return;

    const result = await withProgressIndicator(
        'Synchronizing workspace state...',
        () => syncService.synchronizeState({
            conflictStrategy: strategy,
            syncDeployments: true,
            syncConfigurations: true
        })
    );

    displaySyncResult(result);
}

/**
 * Synchronize with interactive conflict resolution.
 */
async function syncWithConflictResolution(syncService: WorkspaceStateSyncService): Promise<void> {
    const result = await withProgressIndicator(
        'Synchronizing with conflict resolution...',
        () => syncService.synchronizeState({
            conflictStrategy: ConflictResolutionStrategy.MANUAL,
            syncDeployments: true,
            syncConfigurations: true
        })
    );

    if (result.conflicts.length > 0) {
        await resolveConflicts(syncService, result.conflicts);
    }

    displaySyncResult(result);
}

/**
 * Export current workspace state for sharing.
 */
async function exportSyncState(syncService: WorkspaceStateSyncService): Promise<void> {
    try {
        const state = syncService.exportState();

        // Convert Map to object for JSON serialization
        const exportData = {
            deployments: Object.fromEntries(state.deployments),
            configurations: state.configurations,
            lastSync: state.lastSync,
            syncVersion: state.syncVersion,
            exportedAt: new Date().toISOString()
        };

        const json = JSON.stringify(exportData, null, 2);

        // Create a new untitled document with the exported state
        const doc = await vscode.workspace.openTextDocument({
            language: 'json',
            content: json
        });

        await vscode.window.showTextDocument(doc);
        vscode.window.showInformationMessage('State exported successfully. Copy and share this JSON.');
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to export state: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Import workspace state from JSON.
 */
async function importSyncState(syncService: WorkspaceStateSyncService): Promise<void> {
    try {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor. Please open the exported state JSON.');
            return;
        }

        const content = editor.document.getText();
        const importData = JSON.parse(content);

        // Validate and convert
        if (!importData.deployments || !importData.syncVersion) {
            vscode.window.showErrorMessage('Invalid state format. Missing required fields.');
            return;
        }

        const deploymentMap = new Map(Object.entries(importData.deployments)) as Map<string, any>;

        // Create workspace state object
        const stateToImport = {
            deployments: deploymentMap,
            configurations: importData.configurations || {},
            lastSync: importData.lastSync || 0,
            syncVersion: importData.syncVersion
        };

        const strategy = await selectConflictStrategy();
        if (!strategy) return;

        const result = await withProgressIndicator(
            'Importing workspace state...',
            () => syncService.importState(stateToImport, strategy)
        );

        if (result.conflicts.length > 0) {
            await resolveConflicts(syncService, result.conflicts);
        }

        displaySyncResult(result);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to import state: ${error instanceof Error ? error.message : 'Invalid JSON format'}`);
    }
}

/**
 * Perform selective synchronization.
 */
async function syncSelectiveState(syncService: WorkspaceStateSyncService, options: SyncOptions): Promise<void> {
    const strategy = await selectConflictStrategy();
    if (!strategy) return;

    const result = await withProgressIndicator(
        'Synchronizing selected items...',
        () => syncService.synchronizeState({
            ...options,
            conflictStrategy: strategy
        })
    );

    displaySyncResult(result);
}

/**
 * Validate current synchronization state.
 */
async function validateSyncState(syncService: WorkspaceStateSyncService): Promise<void> {
    const validation = await withProgressIndicator(
        'Validating synchronization state...',
        () => syncService.validateState()
    );

    if (validation.valid) {
        vscode.window.showInformationMessage('✓ Synchronization state is valid.');
    } else {
        const message = validation.errors.length > 0
            ? `Found ${validation.errors.length} validation errors:\n${validation.errors.join('\n')}`
            : 'Synchronization state is invalid.';
        vscode.window.showWarningMessage(message);
    }
}

/**
 * Clear all synchronization state.
 */
async function clearSyncState(syncService: WorkspaceStateSyncService): Promise<void> {
    const confirmed = await vscode.window.showWarningMessage(
        'Clear all synchronized state? This cannot be undone.',
        { modal: true },
        'Clear'
    );

    if (confirmed === 'Clear') {
        try {
            await withProgressIndicator(
                'Clearing synchronization state...',
                () => syncService.clearSyncState()
            );
            vscode.window.showInformationMessage('Synchronization state cleared.');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to clear state: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}

/**
 * Show current synchronization status.
 */
function showSyncStatus(syncService: WorkspaceStateSyncService): void {
    const status = syncService.getStatus();
    const message = `Current sync status: ${status.toUpperCase()}`;
    vscode.window.showInformationMessage(message);
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Let user select conflict resolution strategy.
 */
async function selectConflictStrategy(): Promise<ConflictResolutionStrategy | undefined> {
    const choice = await vscode.window.showQuickPick(
        [
            {
                label: 'Local Wins',
                description: 'Keep local version in conflicts',
                value: ConflictResolutionStrategy.LOCAL_WINS
            },
            {
                label: 'Remote Wins',
                description: 'Use remote version in conflicts',
                value: ConflictResolutionStrategy.REMOTE_WINS
            },
            {
                label: 'Merge',
                description: 'Attempt to merge conflicting versions',
                value: ConflictResolutionStrategy.MERGE
            },
            {
                label: 'Manual',
                description: 'Resolve conflicts manually with prompts',
                value: ConflictResolutionStrategy.MANUAL
            }
        ],
        { placeHolder: 'Select conflict resolution strategy' }
    );

    return choice?.value;
}

/**
 * Resolve conflicts with user interaction.
 */
async function resolveConflicts(syncService: WorkspaceStateSyncService, conflicts: any[]): Promise<void> {
    if (conflicts.length === 0) return;

    const output = vscode.window.createOutputChannel('Stellar Suite - Sync Conflicts');
    output.clear();
    output.appendLine(`Found ${conflicts.length} conflicts during synchronization:`);
    output.appendLine('');

    for (let i = 0; i < conflicts.length; i++) {
        const conflict = conflicts[i];
        output.appendLine(`[${i + 1}/${conflicts.length}] ${conflict.type.toUpperCase()}: ${conflict.key}`);
        output.appendLine(`  Local:  ${JSON.stringify(conflict.local)}`);
        output.appendLine(`  Remote: ${JSON.stringify(conflict.remote)}`);
        output.appendLine('');
    }

    output.show();
    vscode.window.showWarningMessage(`${conflicts.length} synchronization conflicts detected. Check output panel for details.`);
}

/**
 * Display synchronization result to user.
 */
function displaySyncResult(result: any): void {
    const { status, itemsProcessed, totalItems, conflicts, errors } = result;

    let message = '';

    switch (status) {
        case SyncStatus.SUCCESS:
            message = `✓ Sync complete: ${itemsProcessed}/${totalItems} items processed`;
            if (conflicts.length > 0) {
                message += `, ${conflicts.length} conflicts resolved`;
            }
            vscode.window.showInformationMessage(message);
            break;

        case SyncStatus.CONFLICT:
            message = `⚠ Sync completed with ${conflicts.length} unresolved conflicts`;
            vscode.window.showWarningMessage(message);
            break;

        case SyncStatus.CANCELLED:
            vscode.window.showInformationMessage('Synchronization cancelled.');
            break;

        case SyncStatus.ERROR:
            message = errors.length > 0 ? errors[0] : 'Synchronization failed';
            vscode.window.showErrorMessage(message);
            break;

        default:
            vscode.window.showInformationMessage(`Sync status: ${status}`);
    }
}

/**
 * Execute operation with progress indicator.
 */
async function withProgressIndicator<T>(
    title: string,
    operation: () => Promise<T>
): Promise<T> {
    return vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title, cancellable: true },
        (_progress: vscode.Progress<{ message?: string; increment?: number }>, _token: vscode.CancellationToken) => operation()
    );
}
