import * as vscode from 'vscode';
import { HealthLevel, LatencyMonitor, LatencySample } from '../monitors/LatencyMonitor';
import { getSharedOutputChannel } from '../utils/outputChannel';

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

export interface AlertEvent {
    category: AlertCategory;
    sample: LatencySample;
    level: HealthLevel;
    message: string;
}

export interface HealthStatsSummary {
    totalSamples: number;
    consecutiveFailures: number;
    latencySpikesCount: number;
    downtimeEventsCount: number;
    recoveryEventsCount: number;
    averageLatencyMs: number;
    currentlyDown: boolean;
}

export class HealthAlertsService implements vscode.Disposable {
    private cfg: HealthAlertsConfig;
    private subscription: vscode.Disposable | undefined;
    private configWatcher: vscode.Disposable;
    private consecutiveFailures = 0;
    private currentlyDown = false;
    private lastNotifiedAt: Partial<Record<AlertCategory, number>> = {};

    // Telemetry stats
    private totalSamples = 0;
    private latencySpikesCount = 0;
    private downtimeEventsCount = 0;
    private recoveryEventsCount = 0;
    private totalLatencySum = 0;
    private successfulSamplesCount = 0;

    // Custom event emitter for alert notification hooks
    private readonly onAlertEmitter = new vscode.EventEmitter<AlertEvent>();
    public readonly onAlert = this.onAlertEmitter.event;

    constructor(private readonly monitor: LatencyMonitor) {
        this.cfg = readConfig();
        this.subscription = this.monitor.onSample((sample, level) => this.handleSample(sample, level));
        this.configWatcher = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('stellarSuite.healthAlerts')) {
                this.cfg = readConfig();
            }
        });

        // Register custom commands for network health summary
        vscode.commands.registerCommand('stellarSuite.getHealthAlertsSummary', () => this.showHealthSummaryReport());
    }

    public getSummary(): HealthStatsSummary {
        return {
            totalSamples: this.totalSamples,
            consecutiveFailures: this.consecutiveFailures,
            latencySpikesCount: this.latencySpikesCount,
            downtimeEventsCount: this.downtimeEventsCount,
            recoveryEventsCount: this.recoveryEventsCount,
            averageLatencyMs: this.successfulSamplesCount > 0 ? this.totalLatencySum / this.successfulSamplesCount : 0,
            currentlyDown: this.currentlyDown,
        };
    }

    private handleSample(sample: LatencySample, level: HealthLevel): void {
        this.totalSamples += 1;

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
                this.downtimeEventsCount += 1;
                this.notifyDowntime(sample, level);
            }
            return;
        }

        // Successful sample tracking
        this.totalLatencySum += sample.latencyMs;
        this.successfulSamplesCount += 1;

        const wasDown = this.currentlyDown;
        this.consecutiveFailures = 0;

        if (wasDown) {
            this.currentlyDown = false;
            this.recoveryEventsCount += 1;
            this.notifyRecovered(sample, level);
        }

        if (sample.latencyMs >= this.cfg.latencySpikeMs) {
            this.latencySpikesCount += 1;
            this.notifyLatencySpike(sample, level);
        }
    }

    private notifyDowntime(sample: LatencySample, level: HealthLevel): void {
        const msg = `Stellar RPC node appears to be down (${this.consecutiveFailures} consecutive failures). Last error: ${sample.error ?? 'unknown'}`;
        
        // Log to Output Channel (minimal interruption design)
        getSharedOutputChannel().appendLine(`[HealthAlerts] DOWNTIME ALERT: ${msg}`);

        // Fire alert event subscriber hook
        this.onAlertEmitter.fire({
            category: 'downtime',
            sample,
            level,
            message: msg
        });

        if (!this.shouldNotify('downtime')) {
            return;
        }

        void vscode.window
            .showWarningMessage(msg, 'Switch Network', 'Show Health', 'Disable Alerts')
            .then(action => this.handleAction(action));
    }

    private notifyRecovered(sample: LatencySample, level: HealthLevel): void {
        const msg = `Stellar RPC is back online (latency ${sample.latencyMs}ms).`;
        
        // Log to Output Channel
        getSharedOutputChannel().appendLine(`[HealthAlerts] RECOVERY ALERT: ${msg}`);

        this.onAlertEmitter.fire({
            category: 'recovered',
            sample,
            level,
            message: msg
        });

        if (!this.shouldNotify('recovered')) {
            return;
        }
        void vscode.window.showInformationMessage(msg);
    }

    private notifyLatencySpike(sample: LatencySample, level: HealthLevel): void {
        const msg = `Stellar RPC latency is ${sample.latencyMs}ms (${level}) — above the configured ${this.cfg.latencySpikeMs}ms threshold.`;
        
        // Log to Output Channel
        getSharedOutputChannel().appendLine(`[HealthAlerts] LATENCY SPIKE ALERT: ${msg}`);

        this.onAlertEmitter.fire({
            category: 'latency-spike',
            sample,
            level,
            message: msg
        });

        if (!this.shouldNotify('latency-spike')) {
            return;
        }

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

    private showHealthSummaryReport(): void {
        const summary = this.getSummary();
        const rpcUrl = this.monitor.getLastSample() ? this.monitor.getSamples()[this.monitor.getSamples().length - 1] : undefined;
        
        let report = `Stellar RPC Health Report:\n`;
        report += `Status: ${summary.currentlyDown ? '🔴 OFFLINE' : '🟢 ONLINE'}\n`;
        report += `Total monitored samples: ${summary.totalSamples}\n`;
        report += `Avg Latency: ${summary.averageLatencyMs.toFixed(1)} ms\n`;
        report += `Latency spikes: ${summary.latencySpikesCount}\n`;
        report += `Downtime incidents: ${summary.downtimeEventsCount}\n`;
        report += `Recoveries: ${summary.recoveryEventsCount}\n`;

        vscode.window.showInformationMessage(report, { modal: true });
    }

    dispose(): void {
        this.subscription?.dispose();
        this.configWatcher.dispose();
        this.onAlertEmitter.dispose();
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
