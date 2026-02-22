export type ProgressOperationState = 'idle' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface CancellationTokenLike {
    readonly isCancellationRequested: boolean;
    onCancellationRequested?(listener: () => void): { dispose(): void };
}

export interface ProgressSnapshot {
    id: string;
    title: string;
    status: ProgressOperationState;
    message?: string;
    details?: string;
    percentage?: number;
    indeterminate: boolean;
    startedAt?: number;
    updatedAt: number;
    completedAt?: number;
    elapsedMs: number;
    estimatedRemainingMs?: number;
    cancellable: boolean;
    cancellationRequested: boolean;
    error?: string;
}

export interface ProgressOperationOptions {
    id: string;
    title: string;
    cancellable?: boolean;
}

export interface ProgressUpdate {
    percentage?: number;
    message?: string;
    details?: string;
    indeterminate?: boolean;
}

export type ProgressListener = (snapshot: ProgressSnapshot) => void;

function clampPercentage(value: number): number {
    return Math.max(0, Math.min(100, value));
}

export function formatDuration(ms: number): string {
    if (ms <= 0) {
        return '0s';
    }

    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    }

    return `${seconds}s`;
}

export class ProgressOperation {
    private snapshot: ProgressSnapshot;
    private readonly listeners = new Set<ProgressListener>();
    private cancellationSubscriptions: Array<{ dispose(): void }> = [];

    constructor(options: ProgressOperationOptions) {
        this.snapshot = {
            id: options.id,
            title: options.title,
            status: 'idle',
            indeterminate: true,
            updatedAt: Date.now(),
            elapsedMs: 0,
            cancellable: options.cancellable ?? false,
            cancellationRequested: false,
        };
    }

    start(message?: string): void {
        const startedAt = Date.now();
        this.snapshot = {
            ...this.snapshot,
            status: 'running',
            startedAt,
            updatedAt: startedAt,
            completedAt: undefined,
            message,
            elapsedMs: 0,
            estimatedRemainingMs: undefined,
            error: undefined,
            cancellationRequested: false,
        };
        this.emit();
    }

    report(update: ProgressUpdate): void {
        const now = Date.now();
        const startedAt = this.snapshot.startedAt ?? now;
        const nextPercentage = typeof update.percentage === 'number'
            ? clampPercentage(update.percentage)
            : this.snapshot.percentage;
        const nextIndeterminate = update.indeterminate ?? (typeof nextPercentage !== 'number');

        let estimatedRemainingMs: number | undefined;
        if (!nextIndeterminate && typeof nextPercentage === 'number' && nextPercentage > 0 && nextPercentage < 100) {
            const elapsedMs = now - startedAt;
            estimatedRemainingMs = Math.max(0, Math.round((elapsedMs * (100 - nextPercentage)) / nextPercentage));
        }

        this.snapshot = {
            ...this.snapshot,
            status: this.snapshot.status === 'idle' ? 'running' : this.snapshot.status,
            updatedAt: now,
            elapsedMs: now - startedAt,
            percentage: nextIndeterminate ? undefined : nextPercentage,
            indeterminate: nextIndeterminate,
            estimatedRemainingMs,
            message: update.message ?? this.snapshot.message,
            details: update.details ?? this.snapshot.details,
        };

        this.emit();
    }

    setIndeterminate(message?: string, details?: string): void {
        this.report({ indeterminate: true, message, details });
    }

    succeed(message?: string, details?: string): void {
        this.complete('succeeded', { message, details, percentage: 100, indeterminate: false });
    }

    fail(error: string, message?: string, details?: string): void {
        this.complete('failed', { message: message ?? 'Operation failed', details, error });
    }

    cancel(message?: string, details?: string): void {
        this.complete('cancelled', { message: message ?? 'Operation cancelled', details });
    }

    requestCancellation(): void {
        if (!this.snapshot.cancellable) {
            return;
        }
        this.snapshot = {
            ...this.snapshot,
            cancellationRequested: true,
            updatedAt: Date.now(),
        };
        this.emit();
    }

    bindCancellationToken(token?: CancellationTokenLike): void {
        if (!token) {
            return;
        }

        if (token.isCancellationRequested) {
            this.requestCancellation();
            return;
        }

        const subscription = token.onCancellationRequested?.(() => this.requestCancellation());
        if (subscription) {
            this.cancellationSubscriptions.push(subscription);
        }
    }

    onUpdate(listener: ProgressListener): { dispose(): void } {
        this.listeners.add(listener);
        listener(this.snapshot);
        return {
            dispose: () => {
                this.listeners.delete(listener);
            },
        };
    }

    getSnapshot(): ProgressSnapshot {
        return { ...this.snapshot };
    }

    dispose(): void {
        for (const subscription of this.cancellationSubscriptions) {
            subscription.dispose();
        }
        this.cancellationSubscriptions = [];
        this.listeners.clear();
    }

    private complete(
        status: 'succeeded' | 'failed' | 'cancelled',
        params: { message?: string; details?: string; percentage?: number; indeterminate?: boolean; error?: string }
    ): void {
        const now = Date.now();
        const startedAt = this.snapshot.startedAt ?? now;

        this.snapshot = {
            ...this.snapshot,
            status,
            completedAt: now,
            updatedAt: now,
            elapsedMs: now - startedAt,
            estimatedRemainingMs: undefined,
            percentage: params.indeterminate ? undefined : params.percentage ?? this.snapshot.percentage,
            indeterminate: params.indeterminate ?? this.snapshot.indeterminate,
            message: params.message ?? this.snapshot.message,
            details: params.details ?? this.snapshot.details,
            error: params.error,
        };

        this.emit();
    }

    private emit(): void {
        for (const listener of [...this.listeners]) {
            listener(this.getSnapshot());
        }
    }
}

export class ProgressIndicatorService {
    private readonly active = new Map<string, ProgressOperation>();

    createOperation(options: ProgressOperationOptions): ProgressOperation {
        const existing = this.active.get(options.id);
        if (existing) {
            existing.dispose();
        }

        const operation = new ProgressOperation(options);
        this.active.set(options.id, operation);

        operation.onUpdate((snapshot) => {
            if (snapshot.status !== 'running' && snapshot.status !== 'idle') {
                this.active.delete(snapshot.id);
            }
        });

        return operation;
    }

    getOperation(id: string): ProgressOperation | undefined {
        return this.active.get(id);
    }
}
