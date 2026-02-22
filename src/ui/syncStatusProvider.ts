import * as vscode from 'vscode';
import { WorkspaceStateSyncService, SyncEvent, SyncStatus } from '../services/workspaceStateSyncService';

/**
 * Manages synchronization status display in VS Code status bar and sidebar.
 */
export class SyncStatusProvider {
    private statusBarItem: vscode.StatusBarItem;
    private syncService: WorkspaceStateSyncService;
    private disposables: vscode.Disposable[] = [];

    constructor(syncService: WorkspaceStateSyncService) {
        this.syncService = syncService;
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusBarItem.command = 'stellarSuite.showSyncStatus';
        this.statusBarItem.tooltip = 'Click to view sync status';

        this.initializeListeners();
        this.updateStatusDisplay();
    }

    /**
     * Initialize event listeners for sync status changes.
     */
    private initializeListeners(): void {
        // Listen to sync status changes
        this.disposables.push(
            this.syncService.onSyncStatusChange((event: SyncEvent) => {
                this.handleSyncEvent(event);
            })
        );
    }

    /**
     * Update status bar display based on current sync status.
     */
    private updateStatusDisplay(): void {
        const status = this.syncService.getStatus();

        switch (status) {
            case SyncStatus.IDLE:
                this.statusBarItem.text = '$(sync) Ready';
                this.statusBarItem.backgroundColor = undefined;
                break;

            case SyncStatus.SYNCING:
                this.statusBarItem.text = '$(loading~spin) Syncing...';
                this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                break;

            case SyncStatus.SUCCESS:
                this.statusBarItem.text = '$(check) Synced';
                this.statusBarItem.backgroundColor = undefined;
                // Auto-hide success message after 3 seconds
                setTimeout(() => {
                    if (this.syncService.getStatus() === SyncStatus.SUCCESS) {
                        this.statusBarItem.text = '$(sync) Ready';
                    }
                }, 3000);
                break;

            case SyncStatus.CONFLICT:
                this.statusBarItem.text = '$(warning) Sync Conflicts';
                this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                break;

            case SyncStatus.ERROR:
                this.statusBarItem.text = '$(error) Sync Error';
                this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
                break;

            case SyncStatus.CANCELLED:
                this.statusBarItem.text = '$(stop) Cancelled';
                this.statusBarItem.backgroundColor = undefined;
                setTimeout(() => {
                    this.statusBarItem.text = '$(sync) Ready';
                }, 3000);
                break;
        }

        this.statusBarItem.show();
    }

    /**
     * Handle sync event and update display.
     */
    private handleSyncEvent(event: any): void {
        this.updateStatusDisplay();

        // Log event details for debugging
        if (event.errors?.length > 0) {
            console.error('[StellarSuite Sync] Errors:', event.errors);
        }
    }

    /**
     * Show status bar item.
     */
    show(): void {
        this.statusBarItem.show();
    }

    /**
     * Hide status bar item.
     */
    hide(): void {
        this.statusBarItem.hide();
    }

    /**
     * Dispose of all resources.
     */
    dispose(): void {
        this.statusBarItem.dispose();
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
    }
}
