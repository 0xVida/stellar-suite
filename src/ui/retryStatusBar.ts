import * as vscode from 'vscode';
import { RpcRetryService } from '../services/rpcRetryService';
import { CircuitState } from '../services/circuitBreaker';

/**
 * Status bar item showing circuit breaker state
 */
export class RetryStatusBarItem {
    private statusBarItem: vscode.StatusBarItem;
    private updateInterval: NodeJS.Timeout | null = null;

    constructor(
        private retryService: RpcRetryService,
        updateIntervalMs: number = 5000
    ) {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            85 // Priority just before other status indicators
        );
        this.statusBarItem.command = 'stellarSuite.viewCircuitBreakerStatus';
        this.statusBarItem.tooltip = 'Click to view circuit breaker status';

        // Start periodic updates
        this.startUpdates(updateIntervalMs);
        this.update();
        this.statusBarItem.show();
    }

    /**
     * Update status bar display
     */
    private update(): void {
        const stats = this.retryService.getCircuitStats();

        switch (stats.state) {
            case CircuitState.CLOSED:
                this.statusBarItem.text = `$(check) Circuit: CLOSED (${stats.successCount}✓)`;
                this.statusBarItem.backgroundColor = undefined;
                break;

            case CircuitState.OPEN:
                this.statusBarItem.text = `$(x) Circuit: OPEN (${stats.failureCount}✗)`;
                this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
                break;

            case CircuitState.HALF_OPEN:
                this.statusBarItem.text = `$(sync~spin) Circuit: HALF_OPEN (Testing)`;
                this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                break;
        }
    }

    /**
     * Start periodic status updates
     */
    private startUpdates(intervalMs: number): void {
        this.updateInterval = setInterval(() => {
            this.update();
        }, intervalMs);
    }

    /**
     * Dispose of resources
     */
    public dispose(): void {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        this.statusBarItem.dispose();
    }
}
