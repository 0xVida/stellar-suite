import * as vscode from 'vscode';
import { getLatencyMonitor } from '../ui/networkStatusBar';
import { HealthLevel, LatencySample } from '../monitors/LatencyMonitor';

export async function showNetworkHealth() {
    const monitor = getLatencyMonitor();

    if (!monitor) {
        vscode.window.showWarningMessage('Network monitoring is not active');
        return;
    }

    const samples = monitor.getSamples();
    const last = monitor.getLastSample();
    const config = vscode.workspace.getConfiguration('stellarSuite');
    const rpcUrl = config.get<string>('rpcUrl') || 'https://soroban-testnet.stellar.org:443';
    const network = config.get<string>('network') || 'testnet';

    const successful = samples.filter(s => s.success);
    const latencies = successful.map(s => s.latencyMs);
    const avg = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : -1;
    const min = latencies.length ? Math.min(...latencies) : -1;
    const max = latencies.length ? Math.max(...latencies) : -1;
    const successRate = samples.length ? (successful.length / samples.length) * 100 : 0;

    const lines: string[] = [];
    lines.push('═══════════════════════════════════════════════════');
    lines.push('         STELLAR RPC NETWORK HEALTH REPORT');
    lines.push('═══════════════════════════════════════════════════');
    lines.push('');
    lines.push(`Network:        ${network}`);
    lines.push(`RPC Endpoint:   ${rpcUrl}`);
    lines.push('');
    lines.push('─────────────────────────────────────────────────');
    lines.push('  LATENCY METRICS');
    lines.push('─────────────────────────────────────────────────');

    if (last && last.success) {
        const level = monitor.classify(last);
        lines.push(`Current:        ${last.latencyMs}ms (${describeLevel(level)})`);
        lines.push(`Average:        ${avg}ms`);
        lines.push(`Min:            ${min}ms`);
        lines.push(`Max:            ${max}ms`);
    } else {
        lines.push('Current:        Not available');
        lines.push(`Last Error:     ${last?.error ?? 'Unknown error'}`);
    }

    lines.push('');
    lines.push('─────────────────────────────────────────────────');
    lines.push('  RELIABILITY');
    lines.push('─────────────────────────────────────────────────');
    lines.push(`Success Rate:   ${successRate.toFixed(1)}%`);
    lines.push(`Measurements:   ${samples.length}`);
    lines.push('');
    lines.push('─────────────────────────────────────────────────');
    lines.push('  PERFORMANCE GUIDE');
    lines.push('─────────────────────────────────────────────────');
    lines.push('Healthy:        Optimal for development');
    lines.push('Degraded:       Expect transaction delays');
    lines.push('Unhealthy:      Consider switching endpoints');
    lines.push('');
    lines.push('═══════════════════════════════════════════════════');

    const report = lines.join('\n');

    const outputChannel = vscode.window.createOutputChannel('Stellar Network Health');
    outputChannel.clear();
    outputChannel.appendLine(report);
    outputChannel.show();

    const actions = [
        { label: '$(gear) Change RPC Endpoint', description: 'Update RPC URL in settings' },
        { label: '$(globe) Switch Network', description: 'Change Stellar network' },
        { label: '$(bell) Configure Alerts', description: 'Open Health Alerts settings' },
    ];

    const placeholder = formatPlaceholder(last);
    const selection = await vscode.window.showQuickPick(actions, { placeHolder: placeholder });

    if (selection) {
        if (selection.label.includes('Change RPC')) {
            vscode.commands.executeCommand('workbench.action.openSettings', 'stellarSuite.rpcUrl');
        } else if (selection.label.includes('Switch Network')) {
            vscode.commands.executeCommand('stellarSuite.switchNetwork');
        } else if (selection.label.includes('Alerts')) {
            vscode.commands.executeCommand('workbench.action.openSettings', 'stellarSuite.healthAlerts');
        }
    }
}

function describeLevel(level: HealthLevel): string {
    switch (level) {
        case 'healthy':
            return 'Healthy';
        case 'degraded':
            return 'Degraded';
        case 'unhealthy':
            return 'Unhealthy';
        default:
            return 'Unknown';
    }
}

function formatPlaceholder(last: LatencySample | undefined): string {
    if (!last) {
        return 'Current latency: N/A';
    }
    if (!last.success) {
        return `Current: offline (${last.error ?? 'unknown error'})`;
    }
    return `Current latency: ${last.latencyMs}ms`;
}
