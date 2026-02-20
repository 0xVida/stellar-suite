import * as vscode from 'vscode';
import { RpcHealthMonitor, EndpointHealth } from '../services/rpcHealthMonitor';

/**
 * Register RPC health monitoring commands.
 */
export function registerHealthCommands(context: vscode.ExtensionContext, monitor: RpcHealthMonitor): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('stellarSuite.showRpcHealth', () => showRpcHealth(monitor)),
        vscode.commands.registerCommand('stellarSuite.checkRpcHealth', () => checkRpcHealth(monitor)),
        vscode.commands.registerCommand('stellarSuite.viewRpcHistory', () => viewRpcHistory(monitor)),
        vscode.commands.registerCommand('stellarSuite.switchRpcEndpoint', () => switchRpcEndpoint(monitor))
    );
}

/**
 * Show current RPC health status.
 */
async function showRpcHealth(monitor: RpcHealthMonitor): Promise<void> {
    const endpoints = monitor.getEndpointsByHealth();
    
    if (endpoints.length === 0) {
        vscode.window.showInformationMessage('No RPC endpoints configured');
        return;
    }

    const items = endpoints.map(ep => ({
        label: `$(${getStatusIcon(ep.status)}) ${ep.endpoint}`,
        description: `${ep.status} (${ep.responseTime}ms) — ${ep.consecutiveFailures} failures`,
        endpoint: ep
    }));

    const selected = await vscode.window.showQuickPick(items, {
        title: 'RPC Endpoint Health',
        placeHolder: 'Select endpoint to view details'
    });

    if (selected) {
        const history = monitor.getHistory(selected.endpoint.endpoint);
        const message = formatHealthMessage(selected.endpoint, history);
        vscode.window.showInformationMessage(message);
    }
}

/**
 * Perform immediate health check.
 */
async function checkRpcHealth(monitor: RpcHealthMonitor): Promise<void> {
    const endpoints = monitor.getEndpointsByHealth();
    if (endpoints.length === 0) {
        vscode.window.showWarningMessage('No RPC endpoints configured');
        return;
    }

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Checking RPC health...' },
        async () => {
            for (const ep of endpoints) {
                await monitor.performHealthCheck(ep.endpoint);
            }
        }
    );

    vscode.window.showInformationMessage('✓ RPC health check completed');
}

/**
 * View RPC health check history.
 */
async function viewRpcHistory(monitor: RpcHealthMonitor): Promise<void> {
    const endpoints = monitor.getEndpointsByHealth();
    if (endpoints.length === 0) {
        vscode.window.showWarningMessage('No RPC endpoints configured');
        return;
    }

    const selected = await vscode.window.showQuickPick(
        endpoints.map(ep => ({
            label: `${ep.endpoint} (${ep.status})`,
            endpoint: ep.endpoint
        })),
        { placeHolder: 'Select endpoint to view history' }
    );

    if (!selected) return;

    const history = monitor.getHistory(selected.endpoint);
    const content = formatHistoryContent(selected.endpoint, history);
    
    const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content });
    await vscode.window.showTextDocument(doc);
}

/**
 * Switch to different RPC endpoint.
 */
async function switchRpcEndpoint(monitor: RpcHealthMonitor): Promise<void> {
    const endpoints = monitor.getEndpointsByHealth();
    if (endpoints.length < 2) {
        vscode.window.showWarningMessage('Only one RPC endpoint available');
        return;
    }

    const selected = await vscode.window.showQuickPick(
        endpoints.map(ep => ({
            label: `${ep.endpoint}`,
            description: `${ep.status} (${ep.responseTime}ms)`,
            endpoint: ep.endpoint
        })),
        { placeHolder: 'Select endpoint to switch to' }
    );

    if (selected) {
        const config = vscode.workspace.getConfiguration('stellarSuite');
        await config.update('rpcUrl', selected.endpoint, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`✓ Switched to ${selected.endpoint}`);
    }
}

// ============================================================
// Helper Functions
// ============================================================

function getStatusIcon(status: EndpointHealth): string {
    switch (status) {
        case EndpointHealth.HEALTHY:
            return 'check';
        case EndpointHealth.DEGRADED:
            return 'warning';
        case EndpointHealth.UNHEALTHY:
            return 'error';
        default:
            return 'question';
    }
}

function formatHealthMessage(health: any, history: any[]): string {
    const recent = history.slice(-5).map(h => `${new Date(h.timestamp).toLocaleTimeString()}: ${h.status}`).join('\n');
    const uptime = history.filter(h => h.status === EndpointHealth.HEALTHY).length / history.length * 100;

    return `Endpoint: ${health.endpoint}
Status: ${health.status}
Response Time: ${health.responseTime}ms
Consecutive Failures: ${health.consecutiveFailures}
Uptime: ${uptime.toFixed(1)}%
Recent: ${recent || 'No history'}`;
}

function formatHistoryContent(endpoint: string, history: any[]): string {
    const header = `# RPC Health History: ${endpoint}\n\n`;
    const stats = `**Latest Status**: ${history[history.length - 1]?.status || 'Unknown'}\n`;
    
    const table = '| Time | Status | Response (ms) | Error |\n|------|--------|---------------|-------|\n' +
        history.slice(-100)
            .reverse()
            .map(h => {
                const time = new Date(h.timestamp).toLocaleTimeString();
                const error = h.error ? `\`${h.error.substring(0, 30)}\`` : '—';
                return `| ${time} | ${h.status} | ${h.responseTime} | ${error} |`;
            })
            .join('\n');

    return header + stats + '\n' + table;
}
