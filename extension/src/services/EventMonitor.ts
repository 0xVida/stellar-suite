import * as vscode from 'vscode';

export type SorobanEventType = 'contract' | 'system' | 'diagnostic';

export interface SorobanEvent {
    id: string;
    type: SorobanEventType;
    ledger: number;
    ledgerClosedAt: string;
    contractId: string;
    topic: string[];
    value: string;
    inSuccessfulContractCall: boolean;
}

export interface EventFilter {
    contractIds?: string[];
    eventTypes?: SorobanEventType[];
}

interface RpcEventsResponse {
    jsonrpc: string;
    id: number;
    result?: {
        events: RpcEventEntry[];
        latestLedger: number;
    };
    error?: { code: number; message: string };
}

interface RpcEventEntry {
    id: string;
    type: SorobanEventType;
    ledger: number;
    ledgerClosedAt: string;
    contractId: string;
    topic: string[];
    value: { xdr: string };
    inSuccessfulContractCall: boolean;
    pagingToken: string;
}

export class EventMonitor implements vscode.Disposable {
    private static readonly CHANNEL_NAME = 'Stellar Kit — Contract Events';

    private readonly channel: vscode.OutputChannel;
    private pollingTimer: ReturnType<typeof setInterval> | undefined;
    private cursor: string | undefined;
    private lastLedger: number | undefined;
    private active = false;

    private rpcUrl: string;
    private filter: EventFilter;
    private pollIntervalMs: number;

    constructor(rpcUrl: string, filter: EventFilter = {}, pollIntervalMs = 4000) {
        this.rpcUrl = rpcUrl.endsWith('/') ? rpcUrl.slice(0, -1) : rpcUrl;
        this.filter = filter;
        this.pollIntervalMs = pollIntervalMs;
        this.channel = vscode.window.createOutputChannel(EventMonitor.CHANNEL_NAME);
    }

    start(): void {
        if (this.active) return;
        this.active = true;

        const filterSummary = this.describeFilter();
        this.channel.appendLine(`[EventMonitor] Monitoring started`);
        this.channel.appendLine(`[EventMonitor] RPC: ${this.rpcUrl}`);
        if (filterSummary) {
            this.channel.appendLine(`[EventMonitor] Filter: ${filterSummary}`);
        }
        this.channel.show(true);

        this.poll().catch((err) => this.logError('Initial poll failed', err));

        this.pollingTimer = setInterval(() => {
            if (!this.active) return;
            this.poll().catch((err) => this.logError('Poll failed', err));
        }, this.pollIntervalMs);
    }

    stop(): void {
        if (!this.active) return;
        this.active = false;
        if (this.pollingTimer !== undefined) {
            clearInterval(this.pollingTimer);
            this.pollingTimer = undefined;
        }
        this.channel.appendLine(`[EventMonitor] Monitoring stopped`);
    }

    clear(): void {
        this.channel.clear();
        this.cursor = undefined;
    }

    updateFilter(filter: EventFilter): void {
        this.filter = filter;
        this.cursor = undefined;
        const summary = this.describeFilter();
        this.channel.appendLine(`[EventMonitor] Filter updated${summary ? ': ' + summary : ' (all events)'}`);
    }

    setRpcUrl(rpcUrl: string): void {
        this.rpcUrl = rpcUrl.endsWith('/') ? rpcUrl.slice(0, -1) : rpcUrl;
        this.cursor = undefined;
        this.channel.appendLine(`[EventMonitor] RPC URL changed: ${this.rpcUrl}`);
    }

    show(): void {
        this.channel.show(true);
    }

    dispose(): void {
        this.stop();
        this.channel.dispose();
    }

    private async poll(): Promise<void> {
        const requestBody = {
            jsonrpc: '2.0',
            id: 1,
            method: 'getEvents',
            params: {
                startLedger: this.cursor ?? 'latest',
                filters: this.buildRpcFilters(),
                limit: 50,
                ...(this.cursor ? { cursor: this.cursor } : {}),
            },
        };

        let response: Response;
        try {
            response = await fetch(`${this.rpcUrl}/rpc`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
                signal: AbortSignal.timeout(10000),
            });
        } catch (err) {
            this.logError('Network error reaching RPC endpoint', err);
            return;
        }

        if (!response.ok) {
            this.channel.appendLine(
                `[EventMonitor] RPC error: HTTP ${response.status} ${response.statusText}`,
            );
            return;
        }

        const data = await response.json() as RpcEventsResponse;

        if (data.error) {
            this.channel.appendLine(
                `[EventMonitor] RPC error ${data.error.code}: ${data.error.message}`,
            );
            return;
        }

        const result = data.result;
        if (!result) return;

        if (result.latestLedger !== this.lastLedger) {
            this.lastLedger = result.latestLedger;
        }

        const events = result.events ?? [];
        if (events.length === 0) return;

        for (const entry of events) {
            this.logEvent(this.normalizeEvent(entry));
        }

        const last = events[events.length - 1];
        if (last?.pagingToken) {
            this.cursor = last.pagingToken;
        }
    }

    private normalizeEvent(entry: RpcEventEntry): SorobanEvent {
        return {
            id: entry.id,
            type: entry.type,
            ledger: entry.ledger,
            ledgerClosedAt: entry.ledgerClosedAt,
            contractId: entry.contractId,
            topic: entry.topic ?? [],
            value: entry.value?.xdr ?? '',
            inSuccessfulContractCall: entry.inSuccessfulContractCall,
        };
    }

    private logEvent(event: SorobanEvent): void {
        const ts = new Date(event.ledgerClosedAt).toISOString().replace('T', ' ').replace('Z', ' UTC');
        const successTag = event.inSuccessfulContractCall ? '  OK' : ' ERR';
        const typeTag = event.type.padEnd(10);
        const contractShort = event.contractId.length > 12
            ? `${event.contractId.slice(0, 6)}...${event.contractId.slice(-6)}`
            : event.contractId;

        this.channel.appendLine(
            `[${ts}] [${typeTag}] [ledger:${event.ledger}] [${successTag}] ${contractShort}`,
        );

        if (event.topic.length > 0) {
            this.channel.appendLine(`  topics : ${event.topic.join(' | ')}`);
        }

        if (event.value) {
            const preview = event.value.length > 80 ? `${event.value.slice(0, 80)}…` : event.value;
            this.channel.appendLine(`  value  : ${preview}`);
        }

        this.channel.appendLine('');
    }

    private buildRpcFilters(): object[] {
        const hasContractIds = (this.filter.contractIds?.length ?? 0) > 0;
        const hasTypes = (this.filter.eventTypes?.length ?? 0) > 0;

        if (!hasContractIds && !hasTypes) {
            return [];
        }

        const filter: Record<string, unknown> = {};

        if (hasTypes && this.filter.eventTypes) {
            filter.type = this.filter.eventTypes[0];
        }

        if (hasContractIds && this.filter.contractIds) {
            filter.contractIds = this.filter.contractIds;
        }

        return [filter];
    }

    private describeFilter(): string {
        const parts: string[] = [];

        if (this.filter.contractIds && this.filter.contractIds.length > 0) {
            parts.push(`contracts=[${this.filter.contractIds.join(', ')}]`);
        }

        if (this.filter.eventTypes && this.filter.eventTypes.length > 0) {
            parts.push(`types=[${this.filter.eventTypes.join(', ')}]`);
        }

        return parts.join(', ');
    }

    private logError(context: string, err: unknown): void {
        const message = err instanceof Error ? err.message : String(err);
        this.channel.appendLine(`[EventMonitor] ERROR — ${context}: ${message}`);
    }
}
