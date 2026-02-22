import { EventEmitter } from 'events';

export interface TimeoutConfig {
    defaultTimeoutMs: number;
    warningThresholdMs: number; // e.g. 10000 ms before timeout to warn
    commandOverrides?: Record<string, number>;
}

export type TimeoutEvent =
    | { type: 'warning'; remainingMs: number }
    | { type: 'timeout' }
    | { type: 'cancelled' }
    | { type: 'extended'; newTimeoutMs: number };

export class CliTimeoutService extends EventEmitter {
    private config: TimeoutConfig;
    private timer?: ReturnType<typeof setTimeout>;
    private warningTimer?: ReturnType<typeof setTimeout>;
    private startTimeMs: number = 0;
    private currentTimeoutMs: number = 0;
    private isRunning: boolean = false;
    private commandName: string = '';

    constructor(config: TimeoutConfig) {
        super();
        this.config = config;
    }

    start(commandName: string, customTimeoutMs?: number): void {
        this.stop();
        this.commandName = commandName;
        this.startTimeMs = Date.now();
        this.isRunning = true;

        this.currentTimeoutMs = customTimeoutMs
            ?? this.config.commandOverrides?.[commandName]
            ?? this.config.defaultTimeoutMs;

        this.scheduleTimers();
    }

    private scheduleTimers(): void {
        if (this.timer) clearTimeout(this.timer);
        if (this.warningTimer) clearTimeout(this.warningTimer);

        const elapsedMs = Date.now() - this.startTimeMs;
        const remainingMs = this.currentTimeoutMs - elapsedMs;

        if (remainingMs <= 0) {
            this.handleTimeout();
            return;
        }

        const warningDelayMs = remainingMs - this.config.warningThresholdMs;

        if (warningDelayMs > 0) {
            this.warningTimer = setTimeout(() => {
                this.emit('event', { type: 'warning', remainingMs: this.config.warningThresholdMs });
            }, warningDelayMs);
        } else if (remainingMs > 0 && this.config.warningThresholdMs > 0) {
            // Already past warning threshold but not timed out
            this.emit('event', { type: 'warning', remainingMs });
        }

        this.timer = setTimeout(() => {
            this.handleTimeout();
        }, remainingMs);
    }

    extend(additionalMs: number): void {
        if (!this.isRunning) return;
        this.currentTimeoutMs += additionalMs;
        this.emit('event', { type: 'extended', newTimeoutMs: this.currentTimeoutMs });
        this.scheduleTimers();
    }

    cancel(): void {
        if (!this.isRunning) return;
        this.stop();
        this.emit('event', { type: 'cancelled' });
    }

    stop(): void {
        this.isRunning = false;
        if (this.timer) clearTimeout(this.timer);
        if (this.warningTimer) clearTimeout(this.warningTimer);
        this.timer = undefined;
        this.warningTimer = undefined;
    }

    private handleTimeout(): void {
        if (!this.isRunning) return;
        this.stop();
        this.emit('event', { type: 'timeout' });
    }
}
