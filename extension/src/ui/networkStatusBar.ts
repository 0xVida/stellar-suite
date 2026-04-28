import * as vscode from 'vscode';
import { LatencyMonitor } from '../monitors/LatencyMonitor';

let networkStatusBarItem: vscode.StatusBarItem;
let latencyMonitor: LatencyMonitor | undefined;

export async function initNetworkStatusBar(context: vscode.ExtensionContext) {
    networkStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    networkStatusBarItem.command = 'stellarSuite.switchNetwork';
    context.subscriptions.push(networkStatusBarItem);

    await updateNetworkStatusBar();
    networkStatusBarItem.show();

    startLatencyMonitor(context);

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async (e) => {
            if (
                e.affectsConfiguration('stellarSuite.rpcUrl') ||
                e.affectsConfiguration('stellarSuite.network')
            ) {
                await updateNetworkStatusBar();
                if (latencyMonitor) {
                    const cfg = vscode.workspace.getConfiguration('stellarSuite');
                    const rpcUrl = cfg.get<string>('rpcUrl') || 'https://soroban-testnet.stellar.org:443';
                    latencyMonitor.updateRpcUrl(rpcUrl);
                }
            }
            if (e.affectsConfiguration('stellarSuite.latencyMonitor')) {
                applyMonitorThresholds();
            }
        })
    );
}

export async function updateNetworkStatusBar() {
    try {
        const config = vscode.workspace.getConfiguration('stellarSuite');
        const currentNetwork = config.get<string>('network') || 'testnet';

        networkStatusBarItem.text = `$(globe) Stellar: ${currentNetwork}`;
        networkStatusBarItem.tooltip = 'Click to switch Stellar Network';
    } catch (e) {
        networkStatusBarItem.text = `$(globe) Stellar: testnet`;
    }
}

function startLatencyMonitor(context: vscode.ExtensionContext): void {
    const cfg = vscode.workspace.getConfiguration('stellarSuite');
    const rpcUrl = cfg.get<string>('rpcUrl') || 'https://soroban-testnet.stellar.org:443';
    const monitorCfg = vscode.workspace.getConfiguration('stellarSuite.latencyMonitor');

    latencyMonitor = new LatencyMonitor({
        rpcUrl,
        pollIntervalMs: monitorCfg.get<number>('pollIntervalSeconds', 30) * 1000,
        healthyThresholdMs: monitorCfg.get<number>('healthyThresholdMs', 250),
        degradedThresholdMs: monitorCfg.get<number>('degradedThresholdMs', 800),
    });

    context.subscriptions.push(latencyMonitor);
    latencyMonitor.start();
}

function applyMonitorThresholds(): void {
    if (!latencyMonitor) {
        return;
    }
    const monitorCfg = vscode.workspace.getConfiguration('stellarSuite.latencyMonitor');
    latencyMonitor.updateThresholds(
        monitorCfg.get<number>('healthyThresholdMs', 250),
        monitorCfg.get<number>('degradedThresholdMs', 800),
    );
}

export function getLatencyMonitor(): LatencyMonitor | undefined {
    return latencyMonitor;
}

export function disposeNetworkStatusBar() {
    if (latencyMonitor) {
        latencyMonitor.dispose();
        latencyMonitor = undefined;
    }
}
