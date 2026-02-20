import * as path from 'path';
import * as vscode from 'vscode';
import { SidebarViewProvider } from '../ui/sidebarView';

export interface AutoRefreshConfig {
    debounceMs?: number;
    minRefreshIntervalMs?: number;
}

/**
 * Debounced file-change driven refresh orchestration for the sidebar.
 */
export class SidebarAutoRefreshService implements vscode.Disposable {
    private readonly watcher: vscode.FileSystemWatcher;
    private readonly pendingChanges = new Set<string>();
    private debounceTimer: NodeJS.Timeout | undefined;
    private flushTimer: NodeJS.Timeout | undefined;
    private lastRefreshAt = 0;

    private readonly debounceMs: number;
    private readonly minRefreshIntervalMs: number;

    constructor(
        private readonly sidebarProvider: SidebarViewProvider,
        private readonly outputChannel: vscode.OutputChannel,
        config: AutoRefreshConfig = {}
    ) {
        this.debounceMs = config.debounceMs ?? 350;
        this.minRefreshIntervalMs = config.minRefreshIntervalMs ?? 900;

        this.watcher = vscode.workspace.createFileSystemWatcher('**/*');
        this.watcher.onDidCreate(uri => this.onFileEvent(uri, 'create'));
        this.watcher.onDidChange(uri => this.onFileEvent(uri, 'change'));
        this.watcher.onDidDelete(uri => this.onFileEvent(uri, 'delete'));
    }

    public triggerManualRefresh(): void {
        this.outputChannel.appendLine('[AutoRefresh] Manual refresh requested');
        this.sidebarProvider.refresh();
    }

    public queueFileChange(fsPath: string): void {
        if (!this.isRelevantPath(fsPath)) {
            return;
        }

        this.pendingChanges.add(fsPath);

        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(() => {
            this.debounceTimer = undefined;
            this.flushPending();
        }, this.debounceMs);
    }

    public isRelevantPath(fsPath: string): boolean {
        const normalized = fsPath.replace(/\\/g, '/');
        if (path.basename(normalized) === 'Cargo.toml') {
            return true;
        }

        if (normalized.endsWith('.wasm') && normalized.includes('/target/')) {
            return true;
        }

        return false;
    }

    private onFileEvent(uri: vscode.Uri, event: 'create' | 'change' | 'delete'): void {
        const fsPath = uri.fsPath;
        if (!this.isRelevantPath(fsPath)) {
            return;
        }

        this.outputChannel.appendLine(`[AutoRefresh] ${event}: ${fsPath}`);
        this.queueFileChange(fsPath);
    }

    private flushPending(): void {
        if (!this.pendingChanges.size) {
            return;
        }

        const now = Date.now();
        const elapsed = now - this.lastRefreshAt;
        const waitMs = Math.max(0, this.minRefreshIntervalMs - elapsed);

        if (waitMs > 0) {
            if (this.flushTimer) {
                clearTimeout(this.flushTimer);
            }

            this.flushTimer = setTimeout(() => {
                this.flushTimer = undefined;
                this.flushPending();
            }, waitMs);
            return;
        }

        const changedPaths = Array.from(this.pendingChanges);
        this.pendingChanges.clear();
        this.lastRefreshAt = Date.now();

        this.outputChannel.appendLine(
            `[AutoRefresh] Refreshing sidebar from ${changedPaths.length} debounced file change(s)`
        );
        this.sidebarProvider.refresh();
    }

    public dispose(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
        }
        this.watcher.dispose();
    }
}