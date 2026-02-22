// ============================================================
// src/services/contractDependencyWatcherService.ts
// File system watcher for contract dependency changes.
// Monitors Cargo.toml and Rust source files for changes and
// triggers dependency graph updates.
// ============================================================

import * as vscode from 'vscode';
import { ContractMetadataService } from './contractMetadataService';
import { ContractDependencyDetectionService, DependencyGraph } from './contractDependencyDetectionService';

// ── Public types ──────────────────────────────────────────────

/**
 * Change event emitted when dependencies are updated
 */
export interface DependencyChangeEvent {
    /** Type of change */
    type: 'added' | 'removed' | 'modified' | 'full-refresh';
    /** Affected contract paths */
    affectedContracts: string[];
    /** Timestamp of change */
    timestamp: number;
    /** Updated dependency graph */
    graph: DependencyGraph;
}

/**
 * Options for the dependency watcher
 */
export interface DependencyWatcherOptions {
    /** Debounce time in milliseconds */
    debounceMs?: number;
    /** Watch source files for import changes */
    watchSourceFiles?: boolean;
    /** Auto-refresh on changes */
    autoRefresh?: boolean;
}

// ── Main service class ────────────────────────────────────────

/**
 * Service for watching and tracking dependency changes.
 * 
 * Features:
 * - Monitor Cargo.toml files for dependency changes
 * - Watch Rust source files for import statement changes
 * - Debounced refresh to avoid excessive updates
 * - Event emission for UI updates
 * - Automatic invalidation of dependency cache
 * 
 * Usage:
 * ```ts
 * const watcher = new ContractDependencyWatcherService(
 *   context,
 *   metadataService,
 *   dependencyService,
 *   outputChannel
 * );
 * 
 * watcher.onDependencyChange((event) => {
 *   console.log('Dependencies changed:', event);
 *   updateUI(event.graph);
 * });
 * 
 * await watcher.start();
 * ```
 */
export class ContractDependencyWatcherService {
    private readonly disposables: vscode.Disposable[] = [];
    private cargoWatcher: vscode.FileSystemWatcher | null = null;
    private sourceWatcher: vscode.FileSystemWatcher | null = null;
    private debounceTimer: NodeJS.Timeout | null = null;
    private pendingChanges = new Set<string>();
    private isRunning = false;
    private changeListeners: Array<(event: DependencyChangeEvent) => void> = [];

    private readonly options: Required<DependencyWatcherOptions>;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly metadataService: ContractMetadataService,
        private readonly dependencyService: ContractDependencyDetectionService,
        private readonly outputChannel: vscode.OutputChannel,
        options: DependencyWatcherOptions = {}
    ) {
        this.options = {
            debounceMs: 1000,
            watchSourceFiles: true,
            autoRefresh: true,
            ...options,
        };
    }

    // ── Main API ──────────────────────────────────────────────

    /**
     * Start watching for dependency changes
     */
    public async start(): Promise<void> {
        if (this.isRunning) {
            this.log('[DependencyWatcher] Already running');
            return;
        }

        this.log('[DependencyWatcher] Starting dependency watcher...');

        // Watch Cargo.toml files
        await this.startCargoWatcher();

        // Watch source files if enabled
        if (this.options.watchSourceFiles) {
            await this.startSourceWatcher();
        }

        this.isRunning = true;
        this.log('[DependencyWatcher] Dependency watcher started');

        // Initial refresh
        if (this.options.autoRefresh) {
            await this.refresh('full-refresh');
        }
    }

    /**
     * Stop watching for dependency changes
     */
    public stop(): void {
        if (!this.isRunning) {
            return;
        }

        this.log('[DependencyWatcher] Stopping dependency watcher...');

        if (this.cargoWatcher) {
            this.cargoWatcher.dispose();
            this.cargoWatcher = null;
        }

        if (this.sourceWatcher) {
            this.sourceWatcher.dispose();
            this.sourceWatcher = null;
        }

        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }

        this.isRunning = false;
        this.pendingChanges.clear();
        this.log('[DependencyWatcher] Dependency watcher stopped');
    }

    /**
     * Manually trigger a dependency refresh
     */
    public async refresh(changeType: 'added' | 'removed' | 'modified' | 'full-refresh' = 'full-refresh'): Promise<void> {
        this.log('[DependencyWatcher] Refreshing dependency graph...');

        try {
            // Invalidate caches
            this.dependencyService.invalidateCache();

            // Scan workspace for contracts
            const scan = await this.metadataService.scanWorkspace();

            if (scan.contracts.length === 0) {
                this.log('[DependencyWatcher] No contracts found in workspace');
                return;
            }

            // Build dependency graph
            const graph = await this.dependencyService.buildDependencyGraph(scan.contracts, {
                detectImports: this.options.watchSourceFiles,
            });

            // Emit change event
            const event: DependencyChangeEvent = {
                type: changeType,
                affectedContracts: Array.from(this.pendingChanges),
                timestamp: Date.now(),
                graph,
            };

            this.emitChange(event);
            this.pendingChanges.clear();

            this.log('[DependencyWatcher] Dependency graph refreshed successfully');
        } catch (error) {
            this.log(`[DependencyWatcher] Failed to refresh: ${error}`);
            throw error;
        }
    }

    /**
     * Register a listener for dependency change events
     */
    public onDependencyChange(listener: (event: DependencyChangeEvent) => void): vscode.Disposable {
        this.changeListeners.push(listener);

        return new vscode.Disposable(() => {
            const index = this.changeListeners.indexOf(listener);
            if (index >= 0) {
                this.changeListeners.splice(index, 1);
            }
        });
    }

    /**
     * Dispose of all resources
     */
    public dispose(): void {
        this.stop();
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables.length = 0;
        this.changeListeners = [];
    }

    // ── Internal implementation ───────────────────────────────

    /**
     * Start watching Cargo.toml files
     */
    private async startCargoWatcher(): Promise<void> {
        this.cargoWatcher = vscode.workspace.createFileSystemWatcher('**/Cargo.toml');

        this.cargoWatcher.onDidCreate((uri) => {
            this.log(`[DependencyWatcher] Cargo.toml created: ${uri.fsPath}`);
            this.scheduleRefresh('added', uri.fsPath);
        });

        this.cargoWatcher.onDidChange((uri) => {
            this.log(`[DependencyWatcher] Cargo.toml changed: ${uri.fsPath}`);
            this.scheduleRefresh('modified', uri.fsPath);
        });

        this.cargoWatcher.onDidDelete((uri) => {
            this.log(`[DependencyWatcher] Cargo.toml deleted: ${uri.fsPath}`);
            this.scheduleRefresh('removed', uri.fsPath);
        });

        this.disposables.push(this.cargoWatcher);
    }

    /**
     * Start watching Rust source files
     */
    private async startSourceWatcher(): Promise<void> {
        this.sourceWatcher = vscode.workspace.createFileSystemWatcher('**/*.rs');

        this.sourceWatcher.onDidCreate((uri) => {
            this.log(`[DependencyWatcher] Source file created: ${uri.fsPath}`);
            this.scheduleRefresh('added', uri.fsPath);
        });

        this.sourceWatcher.onDidChange((uri) => {
            this.log(`[DependencyWatcher] Source file changed: ${uri.fsPath}`);
            this.scheduleRefresh('modified', uri.fsPath);
        });

        this.sourceWatcher.onDidDelete((uri) => {
            this.log(`[DependencyWatcher] Source file deleted: ${uri.fsPath}`);
            this.scheduleRefresh('removed', uri.fsPath);
        });

        this.disposables.push(this.sourceWatcher);
    }

    /**
     * Schedule a debounced refresh
     */
    private scheduleRefresh(changeType: 'added' | 'removed' | 'modified', filePath: string): void {
        this.pendingChanges.add(filePath);

        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(() => {
            if (this.options.autoRefresh) {
                this.refresh(changeType).catch((error) => {
                    this.log(`[DependencyWatcher] Auto-refresh failed: ${error}`);
                });
            }
        }, this.options.debounceMs);
    }

    /**
     * Emit change event to all listeners
     */
    private emitChange(event: DependencyChangeEvent): void {
        for (const listener of this.changeListeners) {
            try {
                listener(event);
            } catch (error) {
                this.log(`[DependencyWatcher] Error in change listener: ${error}`);
            }
        }
    }

    /**
     * Log message to output channel
     */
    private log(message: string): void {
        this.outputChannel.appendLine(message);
    }
}
