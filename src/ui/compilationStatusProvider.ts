// ============================================================
// src/ui/compilationStatusProvider.ts
// UI provider for compilation status display in VS Code.
// ============================================================

import * as vscode from 'vscode';
import { CompilationStatusMonitor } from '../services/compilationStatusMonitor';
import {
    CompilationStatus,
    CompilationEvent,
    ContractCompilationHistory,
    CompilationDiagnosticSeverity,
    CompilationWorkspaceSummary
} from '../types/compilationStatus';

/**
 * Manages compilation status display in VS Code status bar and sidebar.
 */
export class CompilationStatusProvider {
    private statusBarItem: vscode.StatusBarItem;
    private monitor: CompilationStatusMonitor;
    private disposables: vscode.Disposable[] = [];
    private outputChannel: vscode.OutputChannel;

    constructor(monitor: CompilationStatusMonitor) {
        this.monitor = monitor;
        this.outputChannel = vscode.window.createOutputChannel('Stellar Suite - Compilation Status');
        
        // Create status bar item
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left, 
            90
        );
        this.statusBarItem.command = 'stellarSuite.showCompilationStatus';
        this.statusBarItem.tooltip = 'Click to view compilation status';
        this.statusBarItem.show();

        this.initializeListeners();
        this.updateStatusDisplay();
    }

    /**
     * Initialize event listeners for compilation status changes.
     */
    private initializeListeners(): void {
        // Listen to status changes
        this.disposables.push(
            this.monitor.onStatusChange((event: { contractPath: string; previousStatus: CompilationStatus; currentStatus: CompilationStatus; timestamp: number }) => {
                this.handleStatusChange(event);
            })
        );

        // Listen to compilation events
        this.disposables.push(
            this.monitor.onCompilationEvent((event: CompilationEvent) => {
                this.handleCompilationEvent(event);
            })
        );
    }

    /**
     * Update status bar display based on current compilation status.
     */
    private updateStatusDisplay(): void {
        const summary = this.monitor.getWorkspaceSummary();
        const inProgress = this.monitor.getInProgressContracts();

        if (inProgress.length > 0) {
            // Show in-progress status
            if (inProgress.length === 1) {
                const contract = inProgress[0];
                this.statusBarItem.text = `$(loading~spin) Building ${contract.contractName}`;
                this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            } else {
                this.statusBarItem.text = `$(loading~spin) Building ${inProgress.length} contracts`;
                this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            }
        } else if (summary.failed > 0) {
            // Show failed status
            this.statusBarItem.text = `$(error) ${summary.failed} Build Failed`;
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        } else if (summary.warnings > 0) {
            // Show warning status
            this.statusBarItem.text = `$(warning) ${summary.warnings} Build Warning`;
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else if (summary.successful > 0) {
            // Show success status
            this.statusBarItem.text = `$(check) ${summary.successful} Built`;
            this.statusBarItem.backgroundColor = undefined;
        } else {
            // Show idle status
            this.statusBarItem.text = '$(tools) Ready';
            this.statusBarItem.backgroundColor = undefined;
        }

        this.statusBarItem.show();
    }

    /**
     * Handle compilation status change events.
     */
    private handleStatusChange(event: { contractPath: string; previousStatus: CompilationStatus; currentStatus: CompilationStatus; timestamp: number }): void {
        this.updateStatusDisplay();

        // Show notifications for important status changes
        if (event.currentStatus === CompilationStatus.FAILED) {
            const status = this.monitor.getCurrentStatus(event.contractPath);
            if (status) {
                vscode.window.showErrorMessage(`Build failed: ${status.contractName}`);
            }
        } else if (event.currentStatus === CompilationStatus.SUCCESS) {
            const status = this.monitor.getCurrentStatus(event.contractPath);
            if (status) {
                vscode.window.showInformationMessage(`Build successful: ${status.contractName}`);
            }
        }
    }

    /**
     * Handle compilation events for real-time updates.
     */
    private handleCompilationEvent(event: CompilationEvent): void {
        if (event.status === CompilationStatus.IN_PROGRESS) {
            // Update display during compilation
            this.updateStatusDisplay();
        }
    }

    /**
     * Show detailed compilation status in a quick pick menu.
     */
    async showCompilationStatus(): Promise<void> {
        const statuses = this.monitor.getAllStatuses();
        const summary = this.monitor.getWorkspaceSummary();

        if (statuses.length === 0) {
            vscode.window.showInformationMessage('No contracts have been compiled yet.');
            return;
        }

        const items: vscode.QuickPickItem[] = [
            {
                label: '$(dashboard) Workspace Summary',
                detail: `${summary.totalContracts} contracts | ${summary.successful} successful | ${summary.failed} failed | ${summary.warnings} warnings | ${summary.inProgress} in progress`
            },
            { label: '', kind: vscode.QuickPickItemKind.Separator }
        ];

        // Add each contract status
        for (const status of statuses) {
            const icon = this.getStatusIcon(status.status);
            const detail = this.getStatusDetail(status);
            
            items.push({
                label: `${icon} ${status.contractName}`,
                detail: detail,
                description: status.status
            });
        }

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a contract to view details',
            ignoreFocusOut: true
        });

        if (selected && !selected.label.includes('Workspace Summary')) {
            const contractName = selected.label.replace(/^\$\([^)]+\)\s*/, '');
            await this.showContractDetails(contractName);
        }
    }

    /**
     * Get icon for a compilation status.
     */
    private getStatusIcon(status: CompilationStatus): string {
        switch (status) {
            case CompilationStatus.IN_PROGRESS:
                return '$(loading~spin)';
            case CompilationStatus.SUCCESS:
                return '$(check)';
            case CompilationStatus.FAILED:
                return '$(error)';
            case CompilationStatus.WARNING:
                return '$(warning)';
            case CompilationStatus.CANCELLED:
                return '$(stop)';
            case CompilationStatus.IDLE:
            default:
                return '$(circle-outline)';
        }
    }

    /**
     * Get detailed description for a compilation status.
     */
    private getStatusDetail(status: CompilationEvent): string {
        switch (status.status) {
            case CompilationStatus.IN_PROGRESS:
                return `${status.progress || 0}% - ${status.message || 'Compiling...'}`;
            case CompilationStatus.SUCCESS:
                return status.wasmPath ? `Built to ${status.wasmPath}` : 'Build successful';
            case CompilationStatus.FAILED:
                const errorCount = status.diagnostics?.filter(
                    d => d.severity === CompilationDiagnosticSeverity.ERROR
                ).length || 0;
                return `${errorCount} error${errorCount !== 1 ? 's' : ''}`;
            case CompilationStatus.WARNING:
                const warningCount = status.diagnostics?.filter(
                    d => d.severity === CompilationDiagnosticSeverity.WARNING
                ).length || 0;
                return `${warningCount} warning${warningCount !== 1 ? 's' : ''}`;
            case CompilationStatus.CANCELLED:
                return 'Cancelled by user';
            case CompilationStatus.IDLE:
            default:
                return 'Not compiled';
        }
    }

    /**
     * Show detailed information for a specific contract.
     */
    async showContractDetails(contractName: string): Promise<void> {
        // Find the contract path from current statuses
        const status = this.monitor.getAllStatuses().find(s => s.contractName === contractName);
        if (!status) {
            vscode.window.showErrorMessage(`Contract not found: ${contractName}`);
            return;
        }

        const history = this.monitor.getContractHistory(status.contractPath);
        
        const items: vscode.QuickPickItem[] = [
            {
                label: `$(file-directory) ${contractName}`,
                detail: status.contractPath
            },
            { label: '', kind: vscode.QuickPickItemKind.Separator },
            {
                label: 'Status',
                detail: status.status.toUpperCase()
            }
        ];

        // Add progress info if in progress
        if (status.status === CompilationStatus.IN_PROGRESS && status.progress !== undefined) {
            items.push({
                label: 'Progress',
                detail: `${status.progress}%`
            });
        }

        // Add duration if completed
        if (status.duration !== undefined) {
            items.push({
                label: 'Duration',
                detail: `${status.duration}ms`
            });
        }

        // Add WASM path if available
        if (status.wasmPath) {
            items.push({
                label: 'WASM Output',
                detail: status.wasmPath
            });
        }

        // Add history summary if available
        if (history) {
            items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
            items.push({
                label: 'Build History',
                detail: `${history.successCount} successful | ${history.failureCount} failed`
            });
            
            if (history.lastCompiledAt) {
                const date = new Date(history.lastCompiledAt);
                items.push({
                    label: 'Last Compiled',
                    detail: date.toLocaleString()
                });
            }

            // Add recent records
            if (history.records.length > 0) {
                items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
                items.push({
                    label: '$(history) Recent Builds',
                    detail: `${Math.min(5, history.records.length)} most recent`
                });

                const recentRecords = history.records.slice(-5).reverse();
                for (const record of recentRecords) {
                    const icon = this.getStatusIcon(record.status);
                    const date = new Date(record.completedAt).toLocaleTimeString();
                    items.push({
                        label: `  ${icon} ${date}`,
                        detail: `${record.errorCount} errors, ${record.warningCount} warnings | ${record.duration}ms`
                    });
                }
            }
        }

        // Add action buttons
        items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
        items.push({
            label: '$(output) Show Full Output',
            detail: 'View complete compilation output'
        });
        items.push({
            label: '$(clear-all) Clear History',
            detail: 'Remove compilation history for this contract'
        });

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'View contract details',
            ignoreFocusOut: true
        });

        if (selected) {
            if (selected.label.includes('Show Full Output')) {
                await this.showCompilationOutput(status.contractPath);
            } else if (selected.label.includes('Clear History')) {
                await this.clearContractHistory(status.contractPath, contractName);
            }
        }
    }

    /**
     * Show compilation output for a contract.
     */
    private async showCompilationOutput(contractPath: string): Promise<void> {
        const history = this.monitor.getContractHistory(contractPath);
        if (!history || history.records.length === 0) {
            vscode.window.showInformationMessage('No compilation output available.');
            return;
        }

        const lastRecord = history.records[history.records.length - 1];
        if (lastRecord.output) {
            this.outputChannel.clear();
            this.outputChannel.appendLine(`=== Compilation Output for ${lastRecord.contractName} ===`);
            this.outputChannel.appendLine(`Status: ${lastRecord.status}`);
            this.outputChannel.appendLine(`Duration: ${lastRecord.duration}ms`);
            this.outputChannel.appendLine(`Time: ${new Date(lastRecord.completedAt).toLocaleString()}`);
            this.outputChannel.appendLine('');
            this.outputChannel.appendLine(lastRecord.output);
            this.outputChannel.show();
        } else {
            vscode.window.showInformationMessage('No output captured for this compilation.');
        }
    }

    /**
     * Clear compilation history for a contract.
     */
    private async clearContractHistory(contractPath: string, contractName: string): Promise<void> {
        const result = await vscode.window.showWarningMessage(
            `Clear compilation history for ${contractName}?`,
            { modal: true },
            'Clear'
        );

        if (result === 'Clear') {
            this.monitor.clearHistory(contractPath);
            vscode.window.showInformationMessage(`Cleared compilation history for ${contractName}`);
            this.updateStatusDisplay();
        }
    }

    /**
     * Show compilation status for sidebar integration.
     */
    getSidebarStatus(): { text: string; tooltip: string; icon: string } {
        const summary = this.monitor.getWorkspaceSummary();
        const inProgress = this.monitor.getInProgressContracts();

        if (inProgress.length > 0) {
            return {
                text: inProgress.length === 1 ? `Building ${inProgress[0].contractName}` : `Building ${inProgress.length} contracts`,
                tooltip: 'Compilation in progress',
                icon: 'loading~spin'
            };
        } else if (summary.failed > 0) {
            return {
                text: `${summary.failed} failed`,
                tooltip: `${summary.failed} contract${summary.failed !== 1 ? 's' : ''} failed to build`,
                icon: 'error'
            };
        } else if (summary.warnings > 0) {
            return {
                text: `${summary.warnings} warning${summary.warnings !== 1 ? 's' : ''}`,
                tooltip: `${summary.warnings} contract${summary.warnings !== 1 ? 's' : ''} built with warnings`,
                icon: 'warning'
            };
        } else if (summary.successful > 0) {
            return {
                text: `${summary.successful} built`,
                tooltip: `${summary.successful} contract${summary.successful !== 1 ? 's' : ''} built successfully`,
                icon: 'check'
            };
        } else {
            return {
                text: 'Not built',
                tooltip: 'No contracts have been compiled yet',
                icon: 'circle-outline'
            };
        }
    }

    /**
     * Get compilation status icon for a specific contract.
     */
    getContractStatusIcon(contractPath: string): string {
        const status = this.monitor.getCurrentStatus(contractPath);
        if (!status) {
            return 'circle-outline';
        }

        switch (status.status) {
            case CompilationStatus.IN_PROGRESS:
                return 'loading~spin';
            case CompilationStatus.SUCCESS:
                return 'check';
            case CompilationStatus.FAILED:
                return 'error';
            case CompilationStatus.WARNING:
                return 'warning';
            case CompilationStatus.CANCELLED:
                return 'stop';
            case CompilationStatus.IDLE:
            default:
                return 'circle-outline';
        }
    }

    /**
     * Get compilation status text for a specific contract.
     */
    getContractStatusText(contractPath: string): string {
        const status = this.monitor.getCurrentStatus(contractPath);
        if (!status) {
            return 'Not compiled';
        }

        switch (status.status) {
            case CompilationStatus.IN_PROGRESS:
                return status.progress !== undefined ? `${status.progress}%` : 'Building...';
            case CompilationStatus.SUCCESS:
                return 'Built';
            case CompilationStatus.FAILED:
                return 'Failed';
            case CompilationStatus.WARNING:
                return 'Warning';
            case CompilationStatus.CANCELLED:
                return 'Cancelled';
            case CompilationStatus.IDLE:
            default:
                return 'Not compiled';
        }
    }

    /**
     * Dispose of all resources.
     */
    dispose(): void {
        this.statusBarItem.dispose();
        this.outputChannel.dispose();
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
    }
}
