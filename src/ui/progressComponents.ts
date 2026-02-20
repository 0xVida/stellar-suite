import * as vscode from 'vscode';
import { ProgressOperation, ProgressSnapshot, formatDuration } from '../services/progressIndicatorService';

function getStatusIcon(snapshot: ProgressSnapshot): string {
    switch (snapshot.status) {
        case 'succeeded':
            return '$(check)';
        case 'failed':
            return '$(error)';
        case 'cancelled':
            return '$(stop)';
        case 'running':
        case 'idle':
        default:
            return '$(loading~spin)';
    }
}

export function formatProgressMessage(snapshot: ProgressSnapshot): string {
    const parts: string[] = [];

    if (typeof snapshot.percentage === 'number') {
        parts.push(`${Math.round(snapshot.percentage)}%`);
    } else {
        parts.push('Working…');
    }

    if (typeof snapshot.estimatedRemainingMs === 'number') {
        parts.push(`${formatDuration(snapshot.estimatedRemainingMs)} left`);
    }

    if (snapshot.message) {
        parts.push(snapshot.message);
    }

    return parts.join(' • ');
}

export class OperationProgressStatusBar implements vscode.Disposable {
    private readonly statusBarItem: vscode.StatusBarItem;
    private operationSubscription?: { dispose(): void };
    private hideTimer?: NodeJS.Timeout;

    constructor(alignment: vscode.StatusBarAlignment = vscode.StatusBarAlignment.Left, priority = 88) {
        this.statusBarItem = vscode.window.createStatusBarItem(alignment, priority);
    }

    bind(operation: ProgressOperation): void {
        this.operationSubscription?.dispose();
        this.operationSubscription = operation.onUpdate((snapshot) => this.render(snapshot));
    }

    dispose(): void {
        this.operationSubscription?.dispose();
        if (this.hideTimer) {
            clearTimeout(this.hideTimer);
        }
        this.statusBarItem.dispose();
    }

    private render(snapshot: ProgressSnapshot): void {
        if (this.hideTimer) {
            clearTimeout(this.hideTimer);
            this.hideTimer = undefined;
        }

        const icon = getStatusIcon(snapshot);
        const progressText = formatProgressMessage(snapshot);
        this.statusBarItem.text = `${icon} ${snapshot.title} ${progressText}`;

        const tooltipLines = [
            snapshot.message ?? snapshot.title,
            snapshot.details,
            `Elapsed: ${formatDuration(snapshot.elapsedMs)}`,
            snapshot.error,
        ].filter(Boolean);
        this.statusBarItem.tooltip = tooltipLines.join('\n');
        this.statusBarItem.show();

        if (snapshot.status === 'succeeded' || snapshot.status === 'failed' || snapshot.status === 'cancelled') {
            this.hideTimer = setTimeout(() => {
                this.statusBarItem.hide();
            }, 5000);
        }
    }
}
