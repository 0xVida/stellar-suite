import * as vscode from 'vscode';

export type HealthLevel = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface LatencySample {
    latencyMs: number;
    success: boolean;
    timestamp: number;
    error?: string;
}

export interface LatencyMonitorOptions {
    rpcUrl: string;
    pollIntervalMs?: number;
    requestTimeoutMs?: number;
    healthyThresholdMs?: number;
    degradedThresholdMs?: number;
    historySize?: number;
}

const DEFAULTS = {
    pollIntervalMs: 30_000,
    requestTimeoutMs: 8_000,
    healthyThresholdMs: 250,
    degradedThresholdMs: 800,
    historySize: 30,
};

type Listener = (sample: LatencySample, level: HealthLevel) => void;

export class LatencyMonitor implements vscode.Disposable {
    private opts: Required<LatencyMonitorOptions>;
    private statusBarItem: vscode.StatusBarItem;
    private timer: NodeJS.Timeout | undefined;
    private samples: LatencySample[] = [];
    private listeners: Listener[] = [];
    private inFlight = false;
    private disposed = false;

    constructor(options: LatencyMonitorOptions) {
        this.opts = {
            rpcUrl: stripTrailingSlash(options.rpcUrl),
            pollIntervalMs: options.pollIntervalMs ?? DEFAULTS.pollIntervalMs,
            requestTimeoutMs: options.requestTimeoutMs ?? DEFAULTS.requestTimeoutMs,
            healthyThresholdMs: options.healthyThresholdMs ?? DEFAULTS.healthyThresholdMs,
            degradedThresholdMs: options.degradedThresholdMs ?? DEFAULTS.degradedThresholdMs,
            historySize: options.historySize ?? DEFAULTS.historySize,
        };

        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
        this.statusBarItem.command = 'stellarSuite.showNetworkHealth';
        this.renderUnknown();
        this.statusBarItem.show();
    }

    onSample(listener: Listener): vscode.Disposable {
        this.listeners.push(listener);
        return new vscode.Disposable(() => {
            this.listeners = this.listeners.filter(l => l !== listener);
        });
    }

    start(): void {
        if (this.disposed || this.timer) {
            return;
        }
        void this.tick();
        this.timer = setInterval(() => void this.tick(), this.opts.pollIntervalMs);
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
    }

    updateRpcUrl(rpcUrl: string): void {
        this.opts.rpcUrl = stripTrailingSlash(rpcUrl);
        this.samples = [];
        this.renderUnknown();
    }

    updateThresholds(healthyThresholdMs: number, degradedThresholdMs: number): void {
        this.opts.healthyThresholdMs = healthyThresholdMs;
        this.opts.degradedThresholdMs = degradedThresholdMs;
        const last = this.samples[this.samples.length - 1];
        if (last) {
            this.render(last);
        }
    }

    getSamples(): readonly LatencySample[] {
        return this.samples;
    }

    getLastSample(): LatencySample | undefined {
        return this.samples[this.samples.length - 1];
    }

    classify(sample: LatencySample): HealthLevel {
        if (!sample.success) {
            return 'unhealthy';
        }
        if (sample.latencyMs <= this.opts.healthyThresholdMs) {
            return 'healthy';
        }
        if (sample.latencyMs <= this.opts.degradedThresholdMs) {
            return 'degraded';
        }
        return 'unhealthy';
    }

    dispose(): void {
        this.disposed = true;
        this.stop();
        this.statusBarItem.dispose();
        this.listeners = [];
    }

    private async tick(): Promise<void> {
        if (this.inFlight) {
            return;
        }
        this.inFlight = true;
        try {
            const sample = await this.measure();
            this.samples.push(sample);
            if (this.samples.length > this.opts.historySize) {
                this.samples.shift();
            }
            this.render(sample);
            const level = this.classify(sample);
            for (const listener of this.listeners) {
                try {
                    listener(sample, level);
                } catch {
                    // Listeners must not break the polling loop.
                }
            }
        } finally {
            this.inFlight = false;
        }
    }

    private async measure(): Promise<LatencySample> {
        const start = Date.now();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.opts.requestTimeoutMs);
        try {
            const res = await fetch(this.opts.rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }),
                signal: controller.signal,
            });
            const latency = Date.now() - start;
            if (!res.ok) {
                return {
                    latencyMs: latency,
                    success: false,
                    timestamp: Date.now(),
                    error: `HTTP ${res.status} ${res.statusText}`,
                };
            }
            return { latencyMs: latency, success: true, timestamp: Date.now() };
        } catch (err) {
            return {
                latencyMs: Date.now() - start,
                success: false,
                timestamp: Date.now(),
                error: err instanceof Error ? err.message : String(err),
            };
        } finally {
            clearTimeout(timeout);
        }
    }

    private render(sample: LatencySample): void {
        const level = this.classify(sample);
        const icon = iconFor(level);
        const label = sample.success ? `${sample.latencyMs}ms` : 'offline';
        this.statusBarItem.text = `${icon} RPC ${label}`;
        this.statusBarItem.tooltip = buildTooltip(sample, level, this.opts);
        this.statusBarItem.backgroundColor = backgroundFor(level);
    }

    private renderUnknown(): void {
        this.statusBarItem.text = '$(sync~spin) RPC ---ms';
        this.statusBarItem.tooltip = 'Measuring Stellar RPC latency...';
        this.statusBarItem.backgroundColor = undefined;
    }
}

function stripTrailingSlash(url: string): string {
    return url.endsWith('/') ? url.slice(0, -1) : url;
}

function iconFor(level: HealthLevel): string {
    switch (level) {
        case 'healthy':
            return '$(pulse)';
        case 'degraded':
            return '$(warning)';
        case 'unhealthy':
            return '$(error)';
        default:
            return '$(question)';
    }
}

function backgroundFor(level: HealthLevel): vscode.ThemeColor | undefined {
    switch (level) {
        case 'degraded':
            return new vscode.ThemeColor('statusBarItem.warningBackground');
        case 'unhealthy':
            return new vscode.ThemeColor('statusBarItem.errorBackground');
        default:
            return undefined;
    }
}

function buildTooltip(sample: LatencySample, level: HealthLevel, opts: Required<LatencyMonitorOptions>): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = false;
    md.supportThemeIcons = true;
    md.appendMarkdown(`**Stellar RPC** — ${level.toUpperCase()}\n\n`);
    md.appendMarkdown(`- Endpoint: \`${opts.rpcUrl}\`\n`);
    if (sample.success) {
        md.appendMarkdown(`- Latency: **${sample.latencyMs} ms**\n`);
    } else {
        md.appendMarkdown(`- Status: **offline**\n`);
        md.appendMarkdown(`- Error: ${sample.error ?? 'unknown'}\n`);
    }
    md.appendMarkdown(`- Healthy ≤ ${opts.healthyThresholdMs} ms · Degraded ≤ ${opts.degradedThresholdMs} ms\n`);
    md.appendMarkdown(`\nClick for detailed network health.`);
    return md;
}
