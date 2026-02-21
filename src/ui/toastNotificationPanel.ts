// ============================================================
// src/ui/toastNotificationPanel.ts
// UI component for displaying toast notifications
// ============================================================

import * as vscode from 'vscode';
import { ToastNotificationService } from '../services/toastNotificationService';
import { ToastEvent, ToastEventType, ToastType } from '../types/toastNotification';

/**
 * Toast notification panel UI component
 * Provides a status bar integration and command palette for managing toasts
 */
export class ToastNotificationPanel {
    private statusBarItem: vscode.StatusBarItem;
    private notificationService: ToastNotificationService;
    private disposables: vscode.Disposable[] = [];
    private outputChannel: vscode.OutputChannel;

    constructor(notificationService: ToastNotificationService) {
        this.notificationService = notificationService;
        this.outputChannel = vscode.window.createOutputChannel('Stellar Suite Notifications');
        
        // Create status bar item for notification indicator
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.statusBarItem.command = 'stellarSuite.showNotificationHistory';
        this.statusBarItem.tooltip = 'Stellar Suite Notifications';
        
        this.setupEventListeners();
        this.updateStatusBar();
        this.statusBarItem.show();
    }

    /**
     * Setup event listeners for toast events
     */
    private setupEventListeners(): void {
        this.disposables.push(
            this.notificationService.onToastEvent(event => this.handleToastEvent(event))
        );
    }

    /**
     * Handle toast events
     */
    private handleToastEvent(event: ToastEvent): void {
        const timestamp = new Date().toLocaleTimeString();
        
        switch (event.type) {
            case ToastEventType.Shown:
                this.logNotification(event, timestamp);
                this.updateStatusBar();
                break;
                
            case ToastEventType.Dismissed:
                this.updateStatusBar();
                break;
                
            case ToastEventType.ActionClicked:
                this.outputChannel.appendLine(
                    `[${timestamp}] Action clicked: ${event.actionLabel} on "${event.toast.message}"`
                );
                break;
                
            case ToastEventType.QueueChanged:
                this.updateStatusBar();
                break;
        }
    }

    /**
     * Log notification to output channel
     */
    private logNotification(event: ToastEvent, timestamp: string): void {
        const typeEmoji = this.getTypeEmoji(event.toast.type);
        this.outputChannel.appendLine(
            `[${timestamp}] ${typeEmoji} ${event.toast.message}`
        );
        
        if (event.toast.actions && event.toast.actions.length > 0) {
            const actionLabels = event.toast.actions.map(a => a.label).join(', ');
            this.outputChannel.appendLine(`  Actions: ${actionLabels}`);
        }
    }

    /**
     * Get emoji for toast type
     */
    private getTypeEmoji(type: ToastType): string {
        switch (type) {
            case ToastType.Success:
                return '✓';
            case ToastType.Error:
                return '✗';
            case ToastType.Warning:
                return '⚠';
            case ToastType.Info:
            default:
                return 'ℹ';
        }
    }

    /**
     * Get icon for toast type
     */
    private getTypeIcon(type: ToastType): string {
        switch (type) {
            case ToastType.Success:
                return '$(check)';
            case ToastType.Error:
                return '$(error)';
            case ToastType.Warning:
                return '$(warning)';
            case ToastType.Info:
            default:
                return '$(info)';
        }
    }

    /**
     * Update status bar display
     */
    private updateStatusBar(): void {
        const stats = this.notificationService.getStatistics();
        
        if (stats.currentlyVisible > 0) {
            // Show active notification count
            const icon = '$(bell-dot)';
            this.statusBarItem.text = `${icon} ${stats.currentlyVisible}`;
            this.statusBarItem.backgroundColor = new vscode.ThemeColor(
                'statusBarItem.warningBackground'
            );
        } else if (stats.queued > 0) {
            // Show queued notifications
            const icon = '$(bell)';
            this.statusBarItem.text = `${icon} ${stats.queued}`;
            this.statusBarItem.backgroundColor = undefined;
        } else {
            // No notifications
            this.statusBarItem.text = '$(bell)';
            this.statusBarItem.backgroundColor = undefined;
        }
    }

    /**
     * Show notification history in a quick pick
     */
    async showNotificationHistory(): Promise<void> {
        const stats = this.notificationService.getStatistics();
        
        const items: vscode.QuickPickItem[] = [
            {
                label: '$(graph) Notification Statistics',
                kind: vscode.QuickPickItemKind.Separator
            },
            {
                label: `Total Shown: ${stats.totalShown}`,
                description: 'All notifications displayed'
            },
            {
                label: `Currently Visible: ${stats.currentlyVisible}`,
                description: 'Active notifications'
            },
            {
                label: `Queued: ${stats.queued}`,
                description: 'Pending notifications'
            },
            {
                label: '$(symbol-event) By Type',
                kind: vscode.QuickPickItemKind.Separator
            },
            {
                label: `Success: ${stats.byType[ToastType.Success]}`,
                description: this.getTypeIcon(ToastType.Success)
            },
            {
                label: `Errors: ${stats.byType[ToastType.Error]}`,
                description: this.getTypeIcon(ToastType.Error)
            },
            {
                label: `Warnings: ${stats.byType[ToastType.Warning]}`,
                description: this.getTypeIcon(ToastType.Warning)
            },
            {
                label: `Info: ${stats.byType[ToastType.Info]}`,
                description: this.getTypeIcon(ToastType.Info)
            },
            {
                label: '$(tools) Actions',
                kind: vscode.QuickPickItemKind.Separator
            },
            {
                label: '$(clear-all) Clear Statistics',
                description: 'Reset notification statistics'
            },
            {
                label: '$(close-all) Dismiss All',
                description: 'Dismiss all active notifications'
            },
            {
                label: '$(output) Show Output Channel',
                description: 'View notification history log'
            }
        ];

        const selection = await vscode.window.showQuickPick(items, {
            title: 'Notification Center',
            placeHolder: 'View notification statistics and manage notifications'
        });

        if (!selection) {
            return;
        }

        // Handle action selections
        if (selection.label === '$(clear-all) Clear Statistics') {
            const confirm = await vscode.window.showWarningMessage(
                'Clear all notification statistics?',
                { modal: true },
                'Clear'
            );
            if (confirm === 'Clear') {
                this.notificationService.clear();
                this.outputChannel.clear();
                vscode.window.showInformationMessage('Notification statistics cleared');
            }
        } else if (selection.label === '$(close-all) Dismiss All') {
            this.notificationService.dismissAll();
            vscode.window.showInformationMessage('All notifications dismissed');
        } else if (selection.label === '$(output) Show Output Channel') {
            this.outputChannel.show();
        }
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        this.statusBarItem.dispose();
        this.outputChannel.dispose();
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}

/**
 * Create and initialize toast notification panel
 */
export function createToastNotificationPanel(
    notificationService: ToastNotificationService
): ToastNotificationPanel {
    return new ToastNotificationPanel(notificationService);
}
