// ============================================================
// src/services/compilationStatusMonitor.ts
// Service to monitor and track contract compilation status.
// ============================================================

import * as vscode from 'vscode';
import * as path from 'path';
import {
    CompilationStatus,
    CompilationDiagnostic,
    CompilationDiagnosticSeverity,
    CompilationEvent,
    CompilationRecord,
    ContractCompilationHistory,
    CompilationMonitorConfig,
    CompilationWorkspaceSummary,
    StatusChangeEvent,
    CompilationEventType
} from '../types/compilationStatus';

// ============================================================
// Default Configuration
// ============================================================

const DEFAULT_CONFIG: CompilationMonitorConfig = {
    maxHistoryPerContract: 50,
    enableRealTimeUpdates: true,
    enableLogging: true,
    showProgressNotifications: false
};

// ============================================================
// Storage Keys
// ============================================================

const STORAGE_KEYS = {
    HISTORY: 'stellarSuite.compilationHistory',
    CURRENT_STATUS: 'stellarSuite.compilationStatus',
    CONFIG: 'stellarSuite.compilationConfig'
};

// ============================================================
// Compilation Status Monitor Service
// ============================================================

export class CompilationStatusMonitor {
    private context: vscode.ExtensionContext;
    private config: CompilationMonitorConfig;
    private outputChannel: vscode.OutputChannel;
    private currentStatuses: Map<string, CompilationEvent> = new Map();
    private history: Map<string, ContractCompilationHistory> = new Map();
    private statusChangeEmitter = new vscode.EventEmitter<StatusChangeEvent>();
    private compilationEventEmitter = new vscode.EventEmitter<CompilationEvent>();
    readonly onStatusChange = this.statusChangeEmitter.event;
    readonly onCompilationEvent = this.compilationEventEmitter.event;
    private disposables: vscode.Disposable[] = [];

    constructor(
        context: vscode.ExtensionContext,
        config: Partial<CompilationMonitorConfig> = {}
    ) {
        this.context = context;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.outputChannel = vscode.window.createOutputChannel('Stellar Suite - Compilation Monitor');

        this.loadState();
        this.initializeListeners();
    }

    /**
     * Initialize event listeners.
     */
    private initializeListeners(): void {
        // Listen for workspace state changes
        this.disposables.push(
            vscode.workspace.onDidChangeWorkspaceFolders(() => {
                this.log('Workspace folders changed, refreshing compilation status');
            })
        );
    }

    /**
     * Load persisted state from workspace storage.
     */
    private loadState(): void {
        try {
            const historyData = this.context.workspaceState.get<ContractCompilationHistory[]>(STORAGE_KEYS.HISTORY, []);
            for (const history of historyData) {
                this.history.set(history.contractPath, history);
            }

            const statusData = this.context.workspaceState.get<CompilationEvent[]>(STORAGE_KEYS.CURRENT_STATUS, []);
            for (const status of statusData) {
                this.currentStatuses.set(status.contractPath, status);
            }

            this.log(`Loaded state: ${this.history.size} contract histories, ${this.currentStatuses.size} current statuses`);
        } catch (error) {
            this.logError('Failed to load state', error);
        }
    }

    /**
     * Persist current state to workspace storage.
     */
    private saveState(): void {
        try {
            const historyArray = Array.from(this.history.values());
            this.context.workspaceState.update(STORAGE_KEYS.HISTORY, historyArray);

            const statusArray = Array.from(this.currentStatuses.values());
            this.context.workspaceState.update(STORAGE_KEYS.CURRENT_STATUS, statusArray);
        } catch (error) {
            this.logError('Failed to save state', error);
        }
    }

    /**
     * Start monitoring compilation for a contract.
     */
    startCompilation(contractPath: string): CompilationEvent {
        const contractName = path.basename(contractPath);
        const timestamp = Date.now();

        const event: CompilationEvent = {
            contractPath,
            contractName,
            status: CompilationStatus.IN_PROGRESS,
            progress: 0,
            message: 'Compilation started',
            timestamp,
            diagnostics: []
        };

        this.currentStatuses.set(contractPath, event);
        this.log(`Started compilation: ${contractName}`);
        this.compilationEventEmitter.fire(event);
        this.saveState();

        return event;
    }

    /**
     * Update compilation progress.
     */
    updateProgress(contractPath: string, progress: number, message?: string): void {
        const current = this.currentStatuses.get(contractPath);
        if (!current || current.status !== CompilationStatus.IN_PROGRESS) {
            return;
        }

        current.progress = Math.min(100, Math.max(0, progress));
        if (message) {
            current.message = message;
        }
        current.timestamp = Date.now();

        this.compilationEventEmitter.fire(current);
        this.saveState();
    }

    /**
     * Add a diagnostic during compilation.
     */
    addDiagnostic(contractPath: string, diagnostic: CompilationDiagnostic): void {
        const current = this.currentStatuses.get(contractPath);
        if (!current) {
            return;
        }

        if (!current.diagnostics) {
            current.diagnostics = [];
        }
        current.diagnostics.push(diagnostic);

        this.compilationEventEmitter.fire(current);
    }

    /**
     * Report compilation success.
     */
    reportSuccess(contractPath: string, wasmPath?: string, output?: string): CompilationRecord {
        const current = this.currentStatuses.get(contractPath);
        const timestamp = Date.now();
        const contractName = current?.contractName || path.basename(contractPath);
        const startedAt = current?.timestamp || timestamp;

        const diagnostics = current?.diagnostics || [];
        const warnings = diagnostics.filter(d => d.severity === CompilationDiagnosticSeverity.WARNING);
        const errors = diagnostics.filter(d => d.severity === CompilationDiagnosticSeverity.ERROR);

        const status = errors.length > 0 ? CompilationStatus.FAILED : 
                      warnings.length > 0 ? CompilationStatus.WARNING : 
                      CompilationStatus.SUCCESS;

        const record: CompilationRecord = {
            contractPath,
            contractName,
            status,
            startedAt,
            completedAt: timestamp,
            duration: timestamp - startedAt,
            wasmPath,
            diagnostics,
            errorCount: errors.length,
            warningCount: warnings.length,
            output
        };

        this.finalizeCompilation(contractPath, record, status);
        this.log(`Compilation ${status}: ${contractName}${wasmPath ? ` -> ${wasmPath}` : ''}`);

        return record;
    }

    /**
     * Report compilation failure.
     */
    reportFailure(
        contractPath: string, 
        errorMessage: string, 
        diagnostics: CompilationDiagnostic[] = [],
        output?: string
    ): CompilationRecord {
        const current = this.currentStatuses.get(contractPath);
        const timestamp = Date.now();
        const contractName = current?.contractName || path.basename(contractPath);
        const startedAt = current?.timestamp || timestamp;

        const record: CompilationRecord = {
            contractPath,
            contractName,
            status: CompilationStatus.FAILED,
            startedAt,
            completedAt: timestamp,
            duration: timestamp - startedAt,
            diagnostics,
            errorCount: diagnostics.filter(d => d.severity === CompilationDiagnosticSeverity.ERROR).length,
            warningCount: diagnostics.filter(d => d.severity === CompilationDiagnosticSeverity.WARNING).length,
            output
        };

        this.finalizeCompilation(contractPath, record, CompilationStatus.FAILED);
        this.log(`Compilation failed: ${contractName} - ${errorMessage}`);

        return record;
    }

    /**
     * Report compilation cancellation.
     */
    reportCancellation(contractPath: string): CompilationRecord {
        const current = this.currentStatuses.get(contractPath);
        const timestamp = Date.now();
        const contractName = current?.contractName || path.basename(contractPath);
        const startedAt = current?.timestamp || timestamp;

        const record: CompilationRecord = {
            contractPath,
            contractName,
            status: CompilationStatus.CANCELLED,
            startedAt,
            completedAt: timestamp,
            duration: timestamp - startedAt,
            diagnostics: current?.diagnostics || [],
            errorCount: 0,
            warningCount: 0
        };

        this.finalizeCompilation(contractPath, record, CompilationStatus.CANCELLED);
        this.log(`Compilation cancelled: ${contractName}`);

        return record;
    }

    /**
     * Finalize a compilation and update history.
     */
    private finalizeCompilation(
        contractPath: string, 
        record: CompilationRecord, 
        finalStatus: CompilationStatus
    ): void {
        const current = this.currentStatuses.get(contractPath);
        const previousStatus = current?.status || CompilationStatus.IDLE;

        // Update current status
        const updatedEvent: CompilationEvent = {
            contractPath,
            contractName: record.contractName,
            status: finalStatus,
            progress: 100,
            message: `Compilation ${finalStatus}`,
            timestamp: record.completedAt,
            diagnostics: record.diagnostics,
            wasmPath: record.wasmPath,
            duration: record.duration
        };
        this.currentStatuses.set(contractPath, updatedEvent);

        // Update history
        let history = this.history.get(contractPath);
        if (!history) {
            history = {
                contractPath,
                contractName: record.contractName,
                records: [],
                successCount: 0,
                failureCount: 0
            };
            this.history.set(contractPath, history);
        }

        history.records.push(record);
        history.lastCompiledAt = record.completedAt;
        history.lastStatus = finalStatus;

        // Trim history if needed
        if (history.records.length > this.config.maxHistoryPerContract) {
            history.records = history.records.slice(-this.config.maxHistoryPerContract);
        }

        // Update success/failure counts
        if (finalStatus === CompilationStatus.SUCCESS || finalStatus === CompilationStatus.WARNING) {
            history.successCount++;
        } else if (finalStatus === CompilationStatus.FAILED) {
            history.failureCount++;
        }

        // Emit events
        const statusChange: StatusChangeEvent = {
            contractPath,
            previousStatus,
            currentStatus: finalStatus,
            timestamp: record.completedAt
        };
        this.statusChangeEmitter.fire(statusChange);
        this.compilationEventEmitter.fire(updatedEvent);
        this.saveState();
    }

    /**
     * Get current compilation status for a contract.
     */
    getCurrentStatus(contractPath: string): CompilationEvent | undefined {
        return this.currentStatuses.get(contractPath);
    }

    /**
     * Get all current compilation statuses.
     */
    getAllStatuses(): CompilationEvent[] {
        return Array.from(this.currentStatuses.values());
    }

    /**
     * Get compilation history for a contract.
     */
    getContractHistory(contractPath: string): ContractCompilationHistory | undefined {
        return this.history.get(contractPath);
    }

    /**
     * Get all compilation histories.
     */
    getAllHistory(): ContractCompilationHistory[] {
        return Array.from(this.history.values());
    }

    /**
     * Get workspace compilation summary.
     */
    getWorkspaceSummary(): CompilationWorkspaceSummary {
        const statuses = this.getAllStatuses();
        const summary: CompilationWorkspaceSummary = {
            totalContracts: statuses.length,
            inProgress: 0,
            successful: 0,
            failed: 0,
            warnings: 0,
            idle: 0
        };

        for (const status of statuses) {
            switch (status.status) {
                case CompilationStatus.IN_PROGRESS:
                    summary.inProgress++;
                    break;
                case CompilationStatus.SUCCESS:
                    summary.successful++;
                    break;
                case CompilationStatus.FAILED:
                    summary.failed++;
                    break;
                case CompilationStatus.WARNING:
                    summary.warnings++;
                    break;
                case CompilationStatus.IDLE:
                    summary.idle++;
                    break;
            }
        }

        return summary;
    }

    /**
     * Check if any compilation is in progress.
     */
    isAnyCompilationInProgress(): boolean {
        for (const status of this.currentStatuses.values()) {
            if (status.status === CompilationStatus.IN_PROGRESS) {
                return true;
            }
        }
        return false;
    }

    /**
     * Get contracts currently being compiled.
     */
    getInProgressContracts(): CompilationEvent[] {
        return Array.from(this.currentStatuses.values())
            .filter(s => s.status === CompilationStatus.IN_PROGRESS);
    }

    /**
     * Clear compilation history for a contract.
     */
    clearHistory(contractPath: string): void {
        this.history.delete(contractPath);
        this.saveState();
        this.log(`Cleared history for ${contractPath}`);
    }

    /**
     * Clear all compilation history.
     */
    clearAllHistory(): void {
        this.history.clear();
        this.saveState();
        this.log('Cleared all compilation history');
    }

    /**
     * Reset status for a contract to idle.
     */
    resetStatus(contractPath: string): void {
        const current = this.currentStatuses.get(contractPath);
        if (current) {
            const previousStatus = current.status;
            current.status = CompilationStatus.IDLE;
            current.progress = 0;
            current.message = undefined;
            current.diagnostics = [];
            current.timestamp = Date.now();

            this.statusChangeEmitter.fire({
                contractPath,
                previousStatus,
                currentStatus: CompilationStatus.IDLE,
                timestamp: current.timestamp
            });

            this.saveState();
        }
    }

    /**
     * Parse compilation output to extract diagnostics.
     */
    parseDiagnostics(output: string, contractPath: string): CompilationDiagnostic[] {
        const diagnostics: CompilationDiagnostic[] = [];
        const lines = output.split('\n');

        for (const line of lines) {
            // Parse Rust/Cargo error patterns
            // Example: error[E0000]: message at path/to/file.rs:10:5
            const errorMatch = line.match(/^(error|warning)\s*(?:\[(E\d+)\])?\s*:\s*(.+)$/i);
            if (errorMatch) {
                const severity = errorMatch[1].toLowerCase() === 'error' 
                    ? CompilationDiagnosticSeverity.ERROR 
                    : CompilationDiagnosticSeverity.WARNING;
                const code = errorMatch[2];
                const message = errorMatch[3].trim();

                diagnostics.push({
                    severity,
                    message,
                    code,
                    file: contractPath
                });
            }

            // Parse file location patterns
            // Example: --> src/lib.rs:42:10
            const locationMatch = line.match(/-->\s+(.+):(\d+):(\d+)/);
            if (locationMatch && diagnostics.length > 0) {
                const lastDiagnostic = diagnostics[diagnostics.length - 1];
                lastDiagnostic.file = locationMatch[1];
                lastDiagnostic.line = parseInt(locationMatch[2], 10);
                lastDiagnostic.column = parseInt(locationMatch[3], 10);
            }
        }

        return diagnostics;
    }

    /**
     * Update configuration.
     */
    updateConfig(config: Partial<CompilationMonitorConfig>): void {
        this.config = { ...this.config, ...config };
        this.log('Configuration updated');
    }

    /**
     * Get current configuration.
     */
    getConfig(): CompilationMonitorConfig {
        return { ...this.config };
    }

    /**
     * Log message to output channel.
     */
    private log(message: string): void {
        if (this.config.enableLogging) {
            const timestamp = new Date().toISOString();
            this.outputChannel.appendLine(`[${timestamp}] ${message}`);
        }
    }

    /**
     * Log error to output channel.
     */
    private logError(message: string, error: unknown): void {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.outputChannel.appendLine(`[ERROR] ${message}: ${errorMsg}`);
    }

    /**
     * Dispose resources.
     */
    dispose(): void {
        this.saveState();
        this.outputChannel.dispose();
        this.statusChangeEmitter.dispose();
        this.compilationEventEmitter.dispose();
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
    }
}
