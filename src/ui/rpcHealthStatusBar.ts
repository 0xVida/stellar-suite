import * as vscode from 'vscode';
import { RpcHealthMonitor, EndpointHealth } from '../services/rpcHealthMonitor';

/**
 * Displays RPC endpoint health status in VS Code status bar.
 */
export class RpcHealthStatusBar {
    private statusBarItem: vscode.StatusBarItem;
    private healthMonitor: RpcHealthMonitor;
    private disposables: vscode.Disposable[] = [];

    constructor(healthMonitor: RpcHealthMonitor) {
        this.healthMonitor = healthMonitor;
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
        this.statusBarItem.command = 'stellarSuite.showRpcHealth';
        this.setupStateChangedListener();
        this.updateDisplay();
    }

    /**
     * Setup listener for health status changes.
     */
    private setupStateChangedListener(): void {
        this.disposables.push(
            this.healthMonitor.onHealthChange(() => this.updateDisplay())
        );
    }

    /**
     * Update status bar display.
     */
    private updateDisplay(): void {
        const best = this.healthMonitor.getBestEndpoint();
        if (!best) {
            this.statusBarItem.text = '$(question) RPC Status Unknown';
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            this.statusBarItem.show();
            return;
        }

        const health = this.healthMonitor.getEndpointHealth(best.url);
        if (!health) {
            this.statusBarItem.hide();
            return;
        }

        const icon = this.getHealthIcon(health.status);
        const time = health.responseTime ? `${health.responseTime}ms` : '...';

        this.statusBarItem.text = `${icon} RPC: ${health.status} (${time})`;
        this.statusBarItem.backgroundColor = this.getHealthColor(health.status);
        this.statusBarItem.show();
    }

    /**
     * Get icon for health status.
     */
    private getHealthIcon(status: EndpointHealth): string {
        switch (status) {
            case EndpointHealth.HEALTHY:
                return '$(check)';
            case EndpointHealth.DEGRADED:
                return '$(warning)';
            case EndpointHealth.UNHEALTHY:
                return '$(error)';
            default:
                return '$(question)';
        }
    }

    /**
     * Get background color for status.
     */
    private getHealthColor(status: EndpointHealth): vscode.ThemeColor | undefined {
        switch (status) {
            case EndpointHealth.HEALTHY:
                return undefined; // Default color
            case EndpointHealth.DEGRADED:
                return new vscode.ThemeColor('statusBarItem.warningBackground');
            case EndpointHealth.UNHEALTHY:
                return new vscode.ThemeColor('statusBarItem.errorBackground');
            default:
                return undefined;
        }
    }

    /**
     * Show the status bar item.
     */
    show(): void {
        this.statusBarItem.show();
    }

    /**
     * Hide the status bar item.
     */
    hide(): void {
        this.statusBarItem.hide();
    }

    /**
     * Dispose resources.
     */
    dispose(): void {
        this.statusBarItem.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
