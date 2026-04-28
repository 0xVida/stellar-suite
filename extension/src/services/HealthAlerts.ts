import * as vscode from 'vscode';
import { HealthLevel, LatencyMonitor, LatencySample } from '../monitors/LatencyMonitor';

interface HealthAlertsConfig {
    enabled: boolean;
    latencySpikeMs: number;
    consecutiveFailuresForDowntime: number;
    minNotifyIntervalMs: number;
}

const DEFAULTS: HealthAlertsConfig = {
    enabled: true,
    latencySpikeMs: 1500,
    consecutiveFailuresForDowntime: 3,
    minNotifyIntervalMs: 60_000,
};

type AlertCategory = 'latency-spike' | 'downtime' | 'recovered';

export class HealthAlertsService implements vscode.Disposable {
    private cfg: HealthAlertsConfig;
    private subscription: vscode.Disposable | undefined;
    private configWatcher: vscode.Disposable;
    private consecutiveFailures = 0;
    private currentlyDown = false;
    private lastNotifiedAt: Partial<Record<AlertCategory, number>> = {};

    constructor(private readonly monitor: LatencyMonitor) {
        this.cfg = readConfig();
        this.subscription = this.monitor.onSample((sample, level) => this.handleSample(sample, level));
        this.configWatcher = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('stellarSuite.healthAlerts')) {
                this.cfg = readConfig();
            }
        });
    }

    private handleSample(sample: LatencySample, level: HealthLevel): void {
        if (!this.cfg.enabled) {
            return;
        }

        if (!sample.success) {
            this.consecutiveFailures += 1;
            if (
                !this.currentlyDown &&
                this.consecutiveFailures >= this.cfg.consecutiveFailuresForDowntime
            ) {
                this.currentlyDown = true;
                this.notifyDowntime(sample);
            }
            return;
        }

        const wasDown = this.currentlyDown;
        this.consecutiveFailures = 0;

        if (wasDown) {
            this.currentlyDown = false;
            this.notifyRecovered(sample);
        }

        if (sample.latencyMs >= this.cfg.latencySpikeMs) {
            this.notifyLatencySpike(sample, level);
        }
    }

    private notifyDowntime(sample: LatencySample): void {
        if (!this.shouldNotify('downtime')) {
            return;
        }
        const msg = `Stellar RPC node appears to be down (${this.consecutiveFailures} consecutive failures). Last error: ${sample.error ?? 'unknown'}`;
        void vscode.window
            .showWarningMessage(msg, 'Switch Network', 'Show Health', 'Disable Alerts')
            .then(action => this.handleAction(action));
    }

    private notifyRecovered(sample: LatencySample): void {
        if (!this.shouldNotify('recovered')) {
            return;
        }
        void vscode.window.showInformationMessage(
            `Stellar RPC is back online (latency ${sample.latencyMs}ms).`
        );
    }

    private notifyLatencySpike(sample: LatencySample, level: HealthLevel): void {
        if (!this.shouldNotify('latency-spike')) {
            return;
        }
        const msg = `Stellar RPC latency is ${sample.latencyMs}ms (${level}) — above the configured ${this.cfg.latencySpikeMs}ms threshold.`;
        void vscode.window
            .showWarningMessage(msg, 'Switch Network', 'Show Health', 'Disable Alerts')
            .then(action => this.handleAction(action));
    }

    private handleAction(action: string | undefined): void {
        if (!action) {
            return;
        }
        switch (action) {
            case 'Switch Network':
                void vscode.commands.executeCommand('stellarSuite.switchNetwork');
                break;
            case 'Show Health':
                void vscode.commands.executeCommand('stellarSuite.showNetworkHealth');
                break;
            case 'Disable Alerts':
                void vscode.workspace
                    .getConfiguration('stellarSuite')
                    .update('healthAlerts.enabled', false, vscode.ConfigurationTarget.Global);
                break;
        }
    }

    private shouldNotify(category: AlertCategory): boolean {
        const now = Date.now();
        const last = this.lastNotifiedAt[category] ?? 0;
        if (now - last < this.cfg.minNotifyIntervalMs) {
            return false;
        }
        this.lastNotifiedAt[category] = now;
        return true;
    }

    dispose(): void {
        this.subscription?.dispose();
        this.configWatcher.dispose();
    }
}

function readConfig(): HealthAlertsConfig {
    const cfg = vscode.workspace.getConfiguration('stellarSuite.healthAlerts');
    return {
        enabled: cfg.get<boolean>('enabled', DEFAULTS.enabled),
        latencySpikeMs: clampPositive(cfg.get<number>('latencySpikeMs', DEFAULTS.latencySpikeMs), DEFAULTS.latencySpikeMs),
        consecutiveFailuresForDowntime: clampPositive(
            cfg.get<number>('consecutiveFailuresForDowntime', DEFAULTS.consecutiveFailuresForDowntime),
            DEFAULTS.consecutiveFailuresForDowntime,
        ),
        minNotifyIntervalMs: clampPositive(
            cfg.get<number>('minNotifyIntervalMs', DEFAULTS.minNotifyIntervalMs),
            DEFAULTS.minNotifyIntervalMs,
        ),
    };
}

function clampPositive(value: number, fallback: number): number {
    return Number.isFinite(value) && value > 0 ? value : fallback;
}
